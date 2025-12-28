/**
 * API Route برای serve کردن مدل‌های Whisper
 * این route مدل‌های self-host شده را serve می‌کند
 * 
 * Path formats supported:
 * - /api/models/{model}/{path}
 * - /api/models/{model}/resolve/{revision}/{path}
 * 
 * Examples:
 * - /api/models/Xenova/whisper-small/config.json
 * - /api/models/Xenova/whisper-small/resolve/main/config.json
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // ساخت مسیر فایل
    const pathSegments = params.path
    if (!pathSegments || pathSegments.length === 0) {
      console.log('API Models: No path segments provided')
      return NextResponse.json(
        { error: 'Path is required' },
        { status: 400 }
      )
    }
    
    let filePath = Array.isArray(pathSegments) 
      ? pathSegments.join('/')
      : pathSegments
    
    // پشتیبانی از format Hugging Face Hub: {model}/resolve/{revision}/{path}
    // اگر path شامل "resolve" باشد، آن را حذف می‌کنیم
    if (filePath.includes('/resolve/')) {
      const parts = filePath.split('/resolve/')
      if (parts.length === 2) {
        // parts[0] = model name, parts[1] = revision/path
        const revisionAndPath = parts[1].split('/')
        if (revisionAndPath.length >= 2) {
          // revision را نادیده می‌گیریم و فقط path را می‌گیریم
          filePath = `${parts[0]}/${revisionAndPath.slice(1).join('/')}`
          console.log('API Models: Detected Hugging Face format, converted to:', filePath)
        }
      }
    }
    
    console.log('API Models: Requested path segments:', pathSegments)
    console.log('API Models: Requested file path:', filePath)
    
    // ساخت مسیر کامل فایل
    const fullPath = path.join(process.cwd(), 'public', 'models', filePath)
    console.log('API Models: Full path:', fullPath)
    
    // بررسی وجود فایل
    if (!fs.existsSync(fullPath)) {
      console.log('API Models: File not found:', fullPath)
      return NextResponse.json(
        { error: 'File not found', path: filePath },
        { status: 404 }
      )
    }
    
    // بررسی که فایل یک فایل است (نه directory)
    const stats = fs.statSync(fullPath)
    if (!stats.isFile()) {
      return NextResponse.json(
        { error: 'Path is not a file' },
        { status: 400 }
      )
    }
    
    // خواندن فایل
    const fileBuffer = fs.readFileSync(fullPath)
    
    // تعیین content type
    let contentType = 'application/octet-stream'
    if (filePath.endsWith('.json')) {
      contentType = 'application/json'
    } else if (filePath.endsWith('.txt')) {
      contentType = 'text/plain'
    } else if (filePath.endsWith('.onnx')) {
      contentType = 'application/octet-stream'
    } else if (filePath.endsWith('.bin')) {
      contentType = 'application/octet-stream'
    }
    
    console.log('API Models: Serving file:', filePath, 'Content-Type:', contentType, 'Size:', stats.size)
    
    // برگرداندن فایل
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stats.size.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*', // برای CORS
      },
    })
  } catch (error: any) {
    console.error('API Models: Error serving model file:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: error?.message || 'Unknown error' },
      { status: 500 }
    )
  }
}

