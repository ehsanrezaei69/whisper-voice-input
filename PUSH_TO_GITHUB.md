# دستورات Push به GitHub

بعد از ایجاد repository در GitHub، این دستورات را اجرا کنید:

```bash
cd /Users/ehsanrezaei/Documents/GitHub/whisper-voice-input

# اگر repository از قبل remote دارد، حذف کنید
git remote remove origin

# اضافه کردن remote جدید
git remote add origin https://github.com/ehsanrezaei69/whisper-voice-input.git

# Push به GitHub (با SSH یا با `gh auth login` / credential helper؛ توکن را در فایل نگذارید)
git push -u origin main
```

یا اگر از SSH استفاده می‌کنید:

```bash
git remote add origin git@github.com:ehsanrezaei69/whisper-voice-input.git
git push -u origin main
```

