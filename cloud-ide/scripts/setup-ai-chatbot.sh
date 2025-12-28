#!/bin/bash

echo "Installing AI Chatbot Feature with Google Gemini..."

# Install Gemini dependency
echo "Installing Google Generative AI package..."
npm install @google/generative-ai

# Check if Gemini API key is configured
if ! grep -q "GEMINI_API_KEY" .env; then
    echo "Adding Gemini configuration to .env..."
    echo "" >> .env
    echo "# Google Gemini Configuration" >> .env
    echo "GEMINI_API_KEY=your-gemini-api-key-here" >> .env
    echo "GEMINI_MODEL=models/gemini-2.5-flash" >> .env
    echo ""
    echo "Please update your .env file with your actual Gemini API key!"
    echo "Get your free API key at: https://makersuite.google.com/app/apikey"
else
    echo "Gemini configuration already exists in .env"
fi

echo ""
echo "AI Chatbot feature with Gemini installed successfully!"
echo ""
echo "Next steps:"
echo "1. Get your free Gemini API key: https://makersuite.google.com/app/apikey"
echo "2. Add your Gemini API key to .env file"
echo "3. Start the application: npm run dev:all"
echo "4. Click the 'AI' button in the IDE to start chatting!"
echo ""
echo "See AI_CHATBOT_GUIDE.md for usage examples"