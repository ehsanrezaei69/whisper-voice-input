'use client'

import { useState, useRef, useEffect } from 'react'
import { WhisperVoiceServiceSelfHost } from '@/lib/whisper-voice-service-selfhost'

export default function Home() {
  const [text, setText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const voiceServiceRef = useRef<WhisperVoiceServiceSelfHost | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return

    voiceServiceRef.current = new WhisperVoiceServiceSelfHost(
      {
        onTranscript: (fullText: string, isFinal: boolean) => {
          setText(fullText)
          setError(null)
        },
        onError: (error: string) => {
          setError(error)
          setIsRecording(false)
        },
        onStateChange: (recording: boolean) => {
          setIsRecording(recording)
        },
      },
      {
        preserveBaseText: true,
        maxTextLength: 50000,
        language: 'fa',
      }
    )

    return () => {
      if (voiceServiceRef.current) {
        voiceServiceRef.current.destroy()
      }
    }
  }, [])

  const startRecording = async () => {
    if (voiceServiceRef.current && !isRecording) {
      try {
        await voiceServiceRef.current.start(text)
      } catch (error: any) {
        setError(error.message || 'خطا در شروع ضبط')
      }
    }
  }

  const stopRecording = async () => {
    if (voiceServiceRef.current && isRecording) {
      try {
        await voiceServiceRef.current.stop()
        const fullText = voiceServiceRef.current.getFullText()
        if (fullText) {
          setText(fullText)
        }
      } catch (error: any) {
        setError(error.message || 'خطا در توقف ضبط')
      }
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Whisper Voice Input Test</h1>
      
      {error && (
        <div style={{ 
          padding: '1rem', 
          backgroundColor: '#fee', 
          color: '#c00', 
          borderRadius: '4px',
          marginBottom: '1rem'
        }}>
          خطا: {error}
        </div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={!voiceServiceRef.current}
          style={{
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            backgroundColor: isRecording ? '#dc2626' : '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginRight: '1rem',
          }}
        >
          {isRecording ? '⏹️ توقف' : '🎤 شروع ضبط'}
        </button>
        
        {isRecording && (
          <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
            ● در حال ضبط...
          </span>
        )}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="متن اینجا نمایش داده می‌شود..."
        style={{
          width: '100%',
          minHeight: '300px',
          padding: '1rem',
          fontSize: '1rem',
          border: '1px solid #ccc',
          borderRadius: '4px',
          fontFamily: 'inherit',
        }}
      />

      <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
        طول متن: {text.length} کاراکتر
      </div>
    </div>
  )
}

