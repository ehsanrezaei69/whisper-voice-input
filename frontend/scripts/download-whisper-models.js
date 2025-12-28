/**
 * Script برای دانلود مدل‌های Whisper
 * این script مدل‌های Whisper را از Hugging Face Hub دانلود می‌کند
 * و در پوشه public/models/ قرار می‌دهد
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const MODEL_NAME = 'Xenova/whisper-small'
const MODEL_FILES = [
  'config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'vocab.json',
  'merges.txt',
  'onnx/encoder_model.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
]

const BASE_URL = 'https://huggingface.co'
const OUTPUT_DIR = path.join(__dirname, '../public/models', MODEL_NAME)

// ایجاد پوشه‌های لازم
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

// بررسی اینکه آیا فایل موجود است و اندازه مناسب دارد
function shouldDownloadFile(filePath, fileName) {
  if (!fs.existsSync(filePath)) {
    return { shouldDownload: true, reason: 'File does not exist' }
  }
  
  const stats = fs.statSync(filePath)
  
  // بررسی اینکه فایل خالی نیست
  if (stats.size === 0) {
    return { shouldDownload: true, reason: 'File is empty' }
  }
  
  // برای فایل‌های ONNX، حداقل 1MB باید باشد (برای جلوگیری از placeholder)
  if (fileName.endsWith('.onnx')) {
    const minSize = 1024 * 1024 // 1MB
    if (stats.size < minSize) {
      return { 
        shouldDownload: true, 
        reason: `ONNX file is too small (${stats.size} bytes), might be a placeholder` 
      }
    }
    return { 
      shouldDownload: false, 
      reason: `ONNX file exists and has valid size (${(stats.size / 1024 / 1024).toFixed(2)} MB)` 
    }
  }
  
  // برای فایل‌های JSON و TXT، حداقل 100 bytes باید باشد
  if (fileName.endsWith('.json') || fileName.endsWith('.txt')) {
    const minSize = 100 // 100 bytes
    if (stats.size < minSize) {
      return { 
        shouldDownload: true, 
        reason: `File is too small (${stats.size} bytes), might be corrupted` 
      }
    }
    return { 
      shouldDownload: false, 
      reason: `File exists and has valid size (${stats.size} bytes)` 
    }
  }
  
  // برای سایر فایل‌ها، اگر وجود دارد و خالی نیست، skip می‌کنیم
  return { 
    shouldDownload: false, 
    reason: `File exists (${stats.size} bytes)` 
  }
}

// دانلود فایل با پشتیبانی از redirects
function downloadFile(url, outputPath, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects'))
      return
    }
    
    const file = fs.createWriteStream(outputPath)
    
    https.get(url, (response) => {
      // Handle redirects (301, 302, 307, 308)
      if (response.statusCode === 301 || response.statusCode === 302 || 
          response.statusCode === 307 || response.statusCode === 308) {
        file.close()
        const redirectUrl = response.headers.location
        if (!redirectUrl) {
          reject(new Error(`Redirect without location header: ${response.statusCode}`))
          return
        }
        // Handle relative redirects
        const fullRedirectUrl = redirectUrl.startsWith('http') 
          ? redirectUrl 
          : new URL(redirectUrl, url).href
        console.log(`   ↪️  Redirecting to: ${fullRedirectUrl}`)
        return downloadFile(fullRedirectUrl, outputPath, redirectCount + 1)
          .then(resolve)
          .catch(reject)
      }
      
      if (response.statusCode !== 200) {
        file.close()
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`))
        return
      }
      
      response.pipe(file)
      
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      file.close()
      fs.unlink(outputPath, () => {})
      reject(err)
    })
  })
}

// دانلود تمام فایل‌های مدل
async function downloadModels() {
  console.log(`📥 Downloading Whisper models: ${MODEL_NAME}`)
  console.log(`📁 Output directory: ${OUTPUT_DIR}`)
  
  ensureDir(OUTPUT_DIR)
  ensureDir(path.join(OUTPUT_DIR, 'onnx'))
  
  for (const file of MODEL_FILES) {
    const url = `${BASE_URL}/${MODEL_NAME}/resolve/main/${file}`
    const outputPath = path.join(OUTPUT_DIR, file)
    
    // ایجاد پوشه‌های لازم
    ensureDir(path.dirname(outputPath))
    
    // بررسی اینکه آیا فایل موجود است و نیاز به دانلود دارد
    const checkResult = shouldDownloadFile(outputPath, file)
    
    if (!checkResult.shouldDownload) {
      const stats = fs.statSync(outputPath)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
      const sizeKB = (stats.size / 1024).toFixed(2)
      const sizeDisplay = stats.size >= 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`
      console.log(`\n⏭️  Skipping: ${file}`)
      console.log(`   ${checkResult.reason}`)
      console.log(`   Current size: ${sizeDisplay}`)
      continue
    }
    
    console.log(`\n📥 Downloading: ${file}`)
    console.log(`   Reason: ${checkResult.reason}`)
    console.log(`   From: ${url}`)
    console.log(`   To: ${outputPath}`)
    
    try {
      await downloadFile(url, outputPath)
      const stats = fs.statSync(outputPath)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
      const sizeKB = (stats.size / 1024).toFixed(2)
      
      // بررسی اینکه فایل واقعی است (نه placeholder)
      if (stats.size < 1000 && file.endsWith('.onnx')) {
        console.warn(`   ⚠️  Warning: ONNX file is very small (${stats.size} bytes). This might be a placeholder.`)
        console.warn(`   💡 Try using Git LFS: git lfs pull`)
      }
      
      if (stats.size >= 1024 * 1024) {
        console.log(`   ✅ Downloaded: ${sizeMB} MB`)
      } else {
        console.log(`   ✅ Downloaded: ${sizeKB} KB`)
      }
    } catch (error) {
      console.error(`   ❌ Error downloading ${file}:`, error.message)
      throw error
    }
  }
  
  console.log(`\n✅ All models downloaded successfully!`)
  console.log(`📁 Models are in: ${OUTPUT_DIR}`)
}

// اجرای script
downloadModels().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

