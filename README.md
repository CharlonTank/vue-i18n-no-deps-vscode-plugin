# vue-i18n-no-dep README

Welcome to the vue-i18n-no-dep README! This document will provide you with all the necessary information to get started with the vue-i18n-no-dep extension for Visual Studio Code. This extension simplifies the process of internationalizing your application by allowing you to add translations directly from your editor.

## Features

- **Automated Translation Fetching**: Quickly get translations in English and French for any selected text within the editor.
- **API Key Configuration**: Easy setup for your OpenAI GPT API key.
- **Integration with Existing Translation Files**: Seamlessly integrates with your project's existing translation files.
- **On-the-Fly Translation Insertion**: Instantly insert camelCase translation keys into your code, replacing the selected text.

## Requirements

To use vue-i18n-no-dep, you'll need:

- An active OpenAI GPT API key.
- A project with a TypeScript-based translation file structure.

## Extension Settings

This extension contributes the following settings:

- `myExtension.translationFilePath`: The path to your translation file relative to your project root, e.g., `src/utils/i18n.ts`.
- `myExtension.gptApiKey`: Your OpenAI GPT API key.

## How to Use

1. **Setting API Key**:

   - On first use, the extension will prompt you to enter your OpenAI GPT API key.
   - This key is stored and used for future translation requests.

2. **Selecting Text for Translation**:

   - In your code, select the text you want to translate.

3. **Fetching Translations**:

   - Right-click and select "Add Translation" or use the command palette (`Ctrl+Shift+P` or `Cmd+Shift+P` on Mac) and search for "vue-i18n-no-dep: Add Translation".
   - The extension will fetch English and French translations and generate a camelCase key.

4. **Inserting Translations**:

   - The selected text in your code is automatically replaced with the camelized key.
   - The translations are added to your project's translation file.

5. **Accessing Settings**:
   - You can access and modify the extension settings through the command palette by searching for "vue-i18n-no-dep: Open Settings".

## Known Issues

Currently, the extension only supports English and French translations. More languages may be supported in future releases.

## Release Notes

### 1.0.0

Initial release of vue-i18n-no-dep.

---

Enjoy using vue-i18n-no-dep to simplify your application's internationalization process! If you encounter any issues or have suggestions for improvement, please feel free to contribute to the project's repository or open an issue.
