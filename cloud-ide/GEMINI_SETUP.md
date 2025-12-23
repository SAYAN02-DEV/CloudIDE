# 🤖 Google Gemini API Setup Guide

## Why Gemini?
- **100% FREE** - No credit card required
- **Generous limits** - 15 requests/minute, 1,500/day
- **High quality** - Comparable to GPT-4 for code generation
- **Fast responses** - Optimized for speed

## Step-by-Step Setup

### 1. Get Your Free API Key

1. **Visit Google AI Studio**
   - Go to: https://makersuite.google.com/app/apikey
   - Sign in with your Google account

2. **Create API Key**
   - Click "Create API Key"
   - Choose "Create API key in new project" (recommended)
   - Copy your API key (starts with `AIza...`)

### 2. Configure Your Environment

1. **Open the `.env` file** in your cloud-ide directory

2. **Replace the placeholder** with your actual API key:
   ```env
   GEMINI_API_KEY=AIzaSyC-your-actual-api-key-here
   GEMINI_MODEL=models/gemini-2.5-flash
   ```

3. **Save the file**

### 3. Test the Setup

1. **Start the application**:
   ```bash
   npm run dev:all
   ```

2. **Open the IDE** in your browser (usually http://localhost:3000)

3. **Click the "AI" button** in the top toolbar

4. **Test with a simple request**:
   ```
   Create a simple hello.js file
   ```

## API Key Security

### ✅ Do:
- Keep your API key in the `.env` file only
- Never commit `.env` to version control
- Use different keys for development/production

### ❌ Don't:
- Share your API key publicly
- Put it directly in your code
- Commit it to GitHub/Git

## Rate Limits (Free Tier)

- **15 requests per minute**
- **1,500 requests per day**
- **1 million tokens per minute**

These limits are very generous for development and small projects!

## Troubleshooting

### "API key not valid"
- Double-check you copied the full key
- Make sure there are no extra spaces
- Verify the key is enabled in Google AI Studio

### "Quota exceeded"
- You've hit the daily/minute limit
- Wait and try again
- Consider upgrading if needed (but free tier is usually enough)

### "Model not found"
- Make sure `GEMINI_MODEL=models/gemini-2.5-flash` in your .env
- The models/gemini-2.5-flash model is the latest and most reliable
- Always include the "models/" prefix in the model name

## Alternative Models

You can use these Gemini models (all free):

```env
# Latest and fastest (recommended)
GEMINI_MODEL=models/gemini-2.5-flash

# More capable for complex tasks
GEMINI_MODEL=models/gemini-2.5-pro

# Alternative fast model
GEMINI_MODEL=models/gemini-2.0-flash

# Stable fallback
GEMINI_MODEL=models/gemini-flash-latest
```

## Getting Help

If you need help:
1. Check the [Google AI Studio documentation](https://ai.google.dev/docs)
2. Verify your API key at: https://makersuite.google.com/app/apikey
3. Check the browser console for error messages

---

**Ready to code with AI?** Your free Gemini-powered assistant is waiting! 🚀