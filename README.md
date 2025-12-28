# Whisper Voice Input - پروژه مستقل

پروژه مستقل برای کار روی Whisper.js و رفع مشکلات آن، جدا از پروژه اصلی Melaw.

## 🎯 هدف

این پروژه برای:
- تست و رفع مشکلات `@huggingface/transformers`
- توسعه و بهبود Whisper Voice Input
- تست راه‌حل‌های مختلف برای self-hosting
- مستقل از پروژه اصلی Melaw

## 📋 مشکلات فعلی

### ❌ Bug در @huggingface/transformers 3.0.0

خطای `Cannot read properties of undefined (reading 'replace')` از داخل library:
```
at https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0/dist/transformers.min.js:217:6859
at Array.map (<anonymous>)
```

**وضعیت**: همه چیز به درستی تنظیم شده است اما library هنوز خطا می‌دهد.

## 🔧 راه‌حل‌های امتحان شده

1. ✅ تنظیم `remoteURL` به `https://melaw.ir/api/models`
2. ✅ تنظیم `remotePathTemplate` به `{model}/{path}` و `{model}/resolve/{revision}/{path}`
3. ✅ تنظیم `remoteHost` به `melaw.ir`
4. ✅ تنظیم `allowRemoteModels = true` و `allowLocalModels = false`
5. ✅ حذف `localModelPath`
6. ❌ امتحان نسخه 2.17.2 (در دسترس نیست)
7. ❌ تغییر format `remotePathTemplate` (مشکل حل نشد)

## 📁 ساختار پروژه

```
whisper-voice-input/
├── frontend/              # Next.js frontend
│   ├── public/
│   │   └── whisper-worker.js
│   ├── src/
│   │   ├── lib/
│   │   │   ├── whisper-voice-recorder-worker.ts
│   │   │   └── whisper-voice-service-selfhost.ts
│   │   └── app/
│   │       └── api/
│   │           └── models/
│   │               └── [...path]/
│   │                   └── route.ts
│   └── scripts/
│       ├── download-whisper-models.js
│       └── download-onnx-from-lfs.js
├── docs/                  # مستندات
└── README.md
```

## 🚀 شروع کار

### نصب وابستگی‌ها

```bash
cd frontend
npm install
```

### دانلود مدل‌ها

```bash
# دانلود مدل‌های Whisper
node scripts/download-whisper-models.js

# یا دانلود فایل‌های ONNX از LFS
node scripts/download-onnx-from-lfs.js
```

### اجرای پروژه

```bash
npm run dev
```

## 🐛 مشکلات و راه‌حل‌ها

### مشکل 1: خطای replace در @huggingface/transformers 3.0.0

**خطا**: `Cannot read properties of undefined (reading 'replace')`

**وضعیت**: هنوز حل نشده - احتمالاً یک bug در library است.

**راه‌حل‌های امتحان شده**:
- تنظیم `remotePathTemplate` به format‌های مختلف
- تنظیم `remoteHost`
- استفاده از نسخه 2.17.2 (در دسترس نیست)

### مشکل 2: فایل‌های ONNX Git LFS pointers هستند

**راه‌حل**: استفاده از `scripts/download-onnx-from-lfs.js` برای دانلود فایل‌های واقعی.

## 📝 TODO

- [ ] رفع خطای replace در @huggingface/transformers
- [ ] تست با نسخه‌های مختلف library
- [ ] بررسی source code library برای پیدا کردن مشکل
- [ ] ایجاد issue در GitHub برای @huggingface/transformers
- [ ] تست راه‌حل‌های جایگزین

## 🔗 لینک‌های مفید

- [@huggingface/transformers GitHub](https://github.com/huggingface/transformers.js)
- [Whisper Model Hub](https://huggingface.co/Xenova/whisper-small)
- [Documentation](https://huggingface.co/docs/transformers.js)

## 📄 License

این پروژه برای توسعه و تست استفاده می‌شود.

