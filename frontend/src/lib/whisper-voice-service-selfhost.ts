/**
 * Whisper Voice Service - Self-Hosted
 * سرویس حرفه‌ای برای مدیریت Voice Input با Whisper (self-hosted)
 * 
 * Features:
 * - استفاده از Whisper برای دقت بالا
 * - Self-hosted models
 * - حفظ متن قبلی
 * - پشتیبانی از متن‌های طولانی
 */

import { WhisperVoiceRecorderWorker, WhisperVoiceRecorderCallbacks } from './whisper-voice-recorder-worker'

export interface WhisperVoiceServiceCallbacks {
  onTranscript?: (fullText: string, isFinal: boolean) => void
  onError?: (error: string) => void
  onStateChange?: (isRecording: boolean) => void
}

export interface WhisperVoiceServiceOptions {
  preserveBaseText?: boolean
  maxTextLength?: number
  language?: string
}

export class WhisperVoiceServiceSelfHost {
  private voiceRecorder: WhisperVoiceRecorderWorker | null = null
  private baseText: string = ''
  private currentTranscript: string = ''
  private callbacks: WhisperVoiceServiceCallbacks = {}
  private options: WhisperVoiceServiceOptions = {}

  constructor(
    callbacks: WhisperVoiceServiceCallbacks = {},
    options: WhisperVoiceServiceOptions = {}
  ) {
    this.callbacks = callbacks
    this.options = {
      preserveBaseText: true,
      maxTextLength: 50000,
      language: 'fa',
      ...options,
    }
  }

  /**
   * Initialize Whisper Voice Recorder
   */
  async initialize() {
    const voiceCallbacks: WhisperVoiceRecorderCallbacks = {
      onTranscript: (text: string, isFinal: boolean) => {
        this.handleTranscript(text, isFinal)
      },
      onError: (error: string) => {
        this.callbacks.onError?.(error)
      },
      onStateChange: (isRecording: boolean) => {
        this.callbacks.onStateChange?.(isRecording)
      },
    }

    this.voiceRecorder = new WhisperVoiceRecorderWorker(voiceCallbacks)
    // Worker خودش initialize می‌شود، نیازی به await نیست
  }

  /**
   * Handle transcript from Whisper
   */
  private handleTranscript(text: string, isFinal: boolean) {
    if (!text || !text.trim()) {
      return
    }

    // در حالت preserveBaseText، transcript از Whisper فقط بخش جدید است
    // چون Whisper هر chunk را جداگانه پردازش می‌کند
    if (this.options.preserveBaseText) {
      // اضافه کردن transcript جدید به currentTranscript
      this.currentTranscript = text.trim()
      
      // ترکیب baseText و currentTranscript
      const fullText = this.baseText 
        ? `${this.baseText} ${this.currentTranscript}`.trim()
        : this.currentTranscript
      
      // بررسی maxTextLength
      const finalText = this.options.maxTextLength
        ? fullText.substring(0, this.options.maxTextLength)
        : fullText
      
      this.callbacks.onTranscript?.(finalText, isFinal)
    } else {
      // بدون preserve، فقط transcript جدید را نمایش می‌دهیم
      this.currentTranscript = text.trim()
      this.callbacks.onTranscript?.(this.currentTranscript, isFinal)
    }
  }

  /**
   * شروع ضبط صدا
   */
  async start(baseText: string = '') {
    if (!this.voiceRecorder) {
      await this.initialize()
    }

    // تنظیم baseText
    this.baseText = baseText || ''
    this.currentTranscript = ''

    // شروع ضبط - null check
    if (this.voiceRecorder) {
      await this.voiceRecorder.start()
    } else {
      throw new Error('Voice recorder not initialized')
    }
  }

  /**
   * توقف ضبط صدا
   */
  async stop() {
    if (this.voiceRecorder) {
      await this.voiceRecorder.stop()
      
      // به‌روزرسانی baseText با متن کامل
      const fullText = this.getFullText()
      if (fullText) {
        this.baseText = fullText
        this.currentTranscript = ''
      }
    }
    // اگر voiceRecorder null باشد، فقط baseText را حفظ می‌کنیم
  }

  /**
   * دریافت متن کامل (baseText + currentTranscript)
   */
  getFullText(): string {
    if (this.options.preserveBaseText) {
      const fullText = this.baseText 
        ? `${this.baseText} ${this.currentTranscript}`.trim()
        : this.currentTranscript
      
      return this.options.maxTextLength
        ? fullText.substring(0, this.options.maxTextLength)
        : fullText
    } else {
      return this.currentTranscript
    }
  }

  /**
   * تنظیم baseText
   */
  setBaseText(text: string) {
    this.baseText = text || ''
    this.currentTranscript = ''
  }

  /**
   * پاک کردن تمام متن
   */
  clear() {
    this.baseText = ''
    this.currentTranscript = ''
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.voiceRecorder) {
      this.voiceRecorder.destroy()
      this.voiceRecorder = null
    }
  }
}

