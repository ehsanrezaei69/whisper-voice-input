/**
 * Script برای دانلود فایل‌های ONNX واقعی از Git LFS
 * این script فایل‌های ONNX را که به صورت Git LFS pointers هستند، دانلود می‌کند
 */

const https = require('https')
const fs = require('fs')
const path = require('path')

const MODEL_NAME = 'Xenova/whisper-small'
const ONNX_FILES = [
  'encoder_model.onnx',
  'decoder_model_merged_quantized.onnx',
]

const BASE_URL = 'https://huggingface.co'
const OUTPUT_DIR = path.join(__dirname, '../public/models', MODEL_NAME, 'onnx')

// بررسی اینکه آیا فایل Git LFS pointer است
function isLfsPointer(filePath) {
  if (!fs.existsSync(filePath)) {
    return false
  }
  
  const content = fs.readFileSync(filePath, 'utf8')
  return content.includes('version https://git-lfs.github.com/spec/v1')
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
        console.log(`   ↪️  Redirecting to: ${fullRedirectUrl.substring(0, 100)}...`)
        return downloadFile(fullRedirectUrl, outputPath, redirectCount + 1)
          .then(resolve)
          .catch(reject)
      }
      
      if (response.statusCode !== 200) {
        file.close()
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`))
        return
      }
      
      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloadedSize = 0
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length
        if (totalSize > 0) {
          const percent = ((downloadedSize / totalSize) * 100).toFixed(1)
          process.stdout.write(`\r   ⬇️  Downloading: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(2)} MB / ${(totalSize / 1024 / 1024).toFixed(2)} MB)`)
        }
      })
      
      response.pipe(file)
      
      file.on('finish', () => {
        file.close()
        console.log('') // New line after progress
        resolve()
      })
    }).on('error', (err) => {
      file.close()
      fs.unlink(outputPath, () => {})
      reject(err)
    })
  })
}

// دانلود فایل‌های ONNX
async function downloadOnnxFiles() {
  console.log(`📥 Downloading ONNX files for: ${MODEL_NAME}`)
  console.log(`📁 Output directory: ${OUTPUT_DIR}`)
  
  // ایجاد پوشه
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
  
  for (const file of ONNX_FILES) {
    const filePath = path.join(OUTPUT_DIR, file)
    
    // بررسی اینکه آیا فایل موجود است و LFS pointer نیست
    if (fs.existsSync(filePath)) {
      if (isLfsPointer(filePath)) {
        console.log(`\n⚠️  File ${file} is a Git LFS pointer. Downloading real file...`)
      } else {
        const stats = fs.statSync(filePath)
        const minSize = 1024 * 1024 // 1MB
        if (stats.size >= minSize) {
          console.log(`\n⏭️  Skipping: ${file} (already exists, ${(stats.size / 1024 / 1024).toFixed(2)} MB)`)
          continue
        } else {
          console.log(`\n⚠️  File ${file} is too small (${stats.size} bytes). Downloading...`)
        }
      }
    }
    
    const url = `${BASE_URL}/${MODEL_NAME}/resolve/main/onnx/${file}`
    
    console.log(`\n📥 Downloading: ${file}`)
    console.log(`   From: ${url}`)
    console.log(`   To: ${filePath}`)
    
    try {
      await downloadFile(url, filePath)
      const stats = fs.statSync(filePath)
      const sizeMB = (stats.size / 1024 / 1024).toFixed(2)
      
      // بررسی نهایی
      if (isLfsPointer(filePath)) {
        console.error(`   ❌ Error: File is still a Git LFS pointer!`)
        console.error(`   💡 Try using: git lfs pull`)
        throw new Error('File is still a Git LFS pointer')
      }
      
      if (stats.size < 1024 * 1024) {
        console.warn(`   ⚠️  Warning: File is very small (${stats.size} bytes). Might be corrupted.`)
      } else {
        console.log(`   ✅ Downloaded: ${sizeMB} MB`)
      }
    } catch (error) {
      console.error(`   ❌ Error downloading ${file}:`, error.message)
      throw error
    }
  }
  
  console.log(`\n✅ All ONNX files downloaded successfully!`)
  console.log(`📁 Files are in: ${OUTPUT_DIR}`)
}

// اجرای script
downloadOnnxFiles().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

