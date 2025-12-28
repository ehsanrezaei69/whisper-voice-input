/**
 * Whisper Voice Recorder - با استفاده از Web Worker
 * استفاده از @huggingface/transformers در Worker برای جلوگیری از مشکلات build
 * 
 * Features:
 * - استفاده از Web Worker برای isolation
 * - جلوگیری از مشکلات webpack در Next.js
 * - Self-host کردن مدل‌ها
 * - دقت بالا با مدل Whisper
 * - پشتیبانی از متن‌های طولانی
 */

export interface WhisperVoiceRecorderCallbacks {
  onTranscript?: (text: string, isFinal: boolean) => void
  onError?: (error: string) => void
  onStateChange?: (isRecording: boolean) => void
  onProgress?: (progress: { current: number; total: number }) => void
}

export class WhisperVoiceRecorderWorker {
  private worker: Worker | null = null
  private mediaRecorder: MediaRecorder | null = null
  private audioChunks: Blob[] = []
  private isRecording: boolean = false
  private callbacks: WhisperVoiceRecorderCallbacks = {}
  private stream: MediaStream | null = null
  private processInterval: NodeJS.Timeout | null = null
  private readonly CHUNK_DURATION_MS = 3000 // پردازش هر 3 ثانیه
  private isWorkerReady: boolean = false

  constructor(callbacks: WhisperVoiceRecorderCallbacks = {}) {
    this.callbacks = callbacks
    this.initializeWorker()
  }

  /**
   * Initialize Web Worker
   */
  private initializeWorker() {
    try {
      // ایجاد Worker از فایل public
      // استفاده از مسیر نسبی برای سازگاری با Next.js
      const workerUrl = '/whisper-worker.js'
      this.worker = new Worker(workerUrl, { type: 'module' })

      // Handle messages from worker
      this.worker.onmessage = (event) => {
        const { type, ...data } = event.data

        switch (type) {
          case 'initialized':
            this.isWorkerReady = true
            console.log('WhisperVoiceRecorderWorker: Worker initialized')
            break

          case 'status':
            console.log('WhisperVoiceRecorderWorker:', data.message)
            if (data.config) {
              console.log('WhisperVoiceRecorderWorker: Config:', data.config)
            }
            break

          case 'progress':
            if (data.progress) {
              this.callbacks.onProgress?.({
                current: data.progress.loaded || 0,
                total: data.progress.total || 0,
              })
            }
            break

          case 'transcription':
            if (data.success && data.text) {
              console.log('WhisperVoiceRecorderWorker: Transcript:', data.text)
              this.callbacks.onTranscript?.(data.text, true)
            } else if (data.error) {
              console.error('WhisperVoiceRecorderWorker: Transcription error:', data.error)
              this.callbacks.onError?.(data.error)
            }
            break

          case 'error':
            console.error('WhisperVoiceRecorderWorker: Worker error:', data.error)
            this.callbacks.onError?.(data.error || 'Worker error')
            break

          case 'destroyed':
            console.log('WhisperVoiceRecorderWorker: Worker destroyed')
            break
        }
      }

      // Handle worker errors
      this.worker.onerror = (error) => {
        console.error('WhisperVoiceRecorderWorker: Worker error:', error)
        this.callbacks.onError?.('Worker error occurred')
      }

      // Initialize Whisper in worker
      this.initializeWhisper()
    } catch (error: any) {
      console.error('WhisperVoiceRecorderWorker: Error creating worker:', error)
      this.callbacks.onError?.(`Failed to create worker: ${error.message}`)
    }
  }

  /**
   * Initialize Whisper در Worker
   */
  private async initializeWhisper() {
    if (!this.worker) {
      this.callbacks.onError?.('Worker not available')
      return
    }

    try {
      const baseURL = typeof window !== 'undefined' 
        ? window.location.origin 
        : 'http://localhost:3000'

      this.worker.postMessage({
        type: 'init',
        data: {
          baseURL,
          modelName: 'Xenova/whisper-small',
        },
      })

      console.log('WhisperVoiceRecorderWorker: Initialization request sent to worker')
    } catch (error: any) {
      console.error('WhisperVoiceRecorderWorker: Error initializing:', error)
      this.callbacks.onError?.(`Failed to initialize: ${error.message}`)
    }
  }

  /**
   * شروع ضبط صدا
   */
  async start() {
    if (this.isRecording) {
      console.warn('WhisperVoiceRecorderWorker: Already recording')
      return
    }

    // Wait for worker to be ready
    if (!this.isWorkerReady) {
      console.log('WhisperVoiceRecorderWorker: Waiting for worker to be ready...')
      // Wait up to 10 seconds
      let attempts = 0
      while (!this.isWorkerReady && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 500))
        attempts++
      }
      
      if (!this.isWorkerReady) {
        this.callbacks.onError?.('Worker not ready after timeout')
        return
      }
    }

    try {
      // دریافت دسترسی به میکروفن
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000, // Whisper نیاز به 16kHz دارد
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      // ایجاد MediaRecorder
      this.mediaRecorder = new MediaRecorder(this.stream, {
        mimeType: 'audio/webm;codecs=opus',
      })

      this.audioChunks = []

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data)
        }
      }

      // شروع ضبط
      this.mediaRecorder.start(1000) // هر 1 ثانیه یک chunk
      this.isRecording = true
      this.callbacks.onStateChange?.(true)

      console.log('WhisperVoiceRecorderWorker: Recording started')

      // پردازش chunk ها هر 3 ثانیه
      this.processInterval = setInterval(() => {
        this.processChunk()
      }, this.CHUNK_DURATION_MS)
    } catch (error: any) {
      console.error('WhisperVoiceRecorderWorker: Error starting:', error)
      this.callbacks.onError?.(`خطا در شروع ضبط صدا: ${error.message}`)
      this.isRecording = false
      this.callbacks.onStateChange?.(false)
    }
  }

  /**
   * پردازش chunk صوتی با Whisper در Worker
   */
  private async processChunk() {
    if (!this.isRecording || this.audioChunks.length === 0 || !this.worker) {
      return
    }

    try {
      // ایجاد Blob از chunk ها
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
      
      // پاک کردن chunk ها (برای جلوگیری از memory leak)
      this.audioChunks = []

      // تبدیل Blob به audio data برای Whisper
      const audioData = await this.blobToAudioData(audioBlob)

      // ارسال به Worker برای transcription
      this.worker.postMessage({
        type: 'transcribe',
        data: {
          audioData,
          options: {
            language: 'fa', // فارسی
          },
        },
      })
    } catch (error: any) {
      console.error('WhisperVoiceRecorderWorker: Error processing chunk:', error)
      // ادامه ضبط حتی اگر یک chunk خطا داشته باشد
    }
  }

  /**
   * تبدیل Blob به audio data برای Whisper
   */
  private async blobToAudioData(blob: Blob): Promise<Float32Array> {
    const arrayBuffer = await blob.arrayBuffer()
    const audioContext = new AudioContext({ sampleRate: 16000 })
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    
    // تبدیل به Float32Array (mono)
    const channelData = audioBuffer.getChannelData(0)
    return channelData
  }

  /**
   * توقف ضبط صدا
   */
  async stop() {
    if (!this.isRecording) {
      return
    }

    try {
      // توقف interval
      if (this.processInterval) {
        clearInterval(this.processInterval)
        this.processInterval = null
      }

      // پردازش آخرین chunk
      if (this.audioChunks.length > 0 && this.worker) {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' })
        const audioData = await this.blobToAudioData(audioBlob)
        
        this.worker.postMessage({
          type: 'transcribe',
          data: {
            audioData,
            options: {
              language: 'fa',
            },
          },
        })
      }

      // توقف MediaRecorder
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop()
      }

      // توقف stream
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop())
        this.stream = null
      }

      this.isRecording = false
      this.callbacks.onStateChange?.(false)

      console.log('WhisperVoiceRecorderWorker: Recording stopped')
    } catch (error: any) {
      console.error('WhisperVoiceRecorderWorker: Error stopping:', error)
      this.callbacks.onError?.(`خطا در توقف ضبط صدا: ${error.message}`)
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.isRecording) {
      this.stop()
    }
    
    if (this.processInterval) {
      clearInterval(this.processInterval)
      this.processInterval = null
    }
    
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    // Terminate worker
    if (this.worker) {
      this.worker.postMessage({ type: 'destroy' })
      this.worker.terminate()
      this.worker = null
    }

    this.isWorkerReady = false
  }
}

