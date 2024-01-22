
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';

import { EOL } from 'os';

export function activate(context: vscode.ExtensionContext) {

	// Check and prompt for GPT API Key
	let apiKey = context.globalState.get<string>('gptApiKey');
	if (!apiKey) {
		promptForApiKey(context);
	}

	// Register command to open extension settings
	let openSettingsDisposable = vscode.commands.registerCommand('vue-i18n-no-dep.openSettings', () => {
		vscode.commands.executeCommand('workbench.action.openSettings', 'myExtension');
	});
	context.subscriptions.push(openSettingsDisposable);
	let addTranslationDisposable = vscode.commands.registerTextEditorCommand('vue-i18n-no-dep.addTranslation', async (textEditor, edit) => {
		const selections = Array.from(textEditor.selections);
		selections.sort((a, b) => a.start.isBefore(b.start) ? 1 : -1);

		let apiKey = context.globalState.get<string>('gptApiKey');
		if (!apiKey) {
			vscode.window.showWarningMessage('vue-i18n-no-dep: GPT API Key is not set. Please set it in the extension settings.');
			return;
		}

		let workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
		let config = vscode.workspace.getConfiguration('myExtension');
		let translationFilePath = config.get<string>('translationFilePath') || 'src/utils/i18n.ts';

		if (workspaceFolder) {
			translationFilePath = path.join(workspaceFolder, translationFilePath);
		}

		for (const selection of selections) {
			const selectedText = textEditor.document.getText(selection).trim();
			const documentText = textEditor.document.getText();

			if (!selectedText) {
				vscode.window.showWarningMessage('vue-i18n-no-dep: No text selected.');
				continue;
			}

			try {
				let { camelizedKey, englishTranslation, frenchTranslation, translationType, camelCaseCall } = await getTranslationsFromGPT(apiKey, selectedText);

				modifyTranslationFile(translationFilePath, camelizedKey, englishTranslation, frenchTranslation, translationType);

				await textEditor.edit(editBuilder => {
					const selectedLineText = textEditor.document.lineAt(selection.start.line).text;
					const isInTemplate = isTextInTemplate(documentText, selection.start.line);
					const selectedTextReplacement = camelCaseCall || camelizedKey;
					if (isInTemplate) {
						if (isVueAttributeValue(selectedLineText, selectedText)) {
							const attributeRegex = new RegExp(`([a-zA-Z-]+)="[^"]*${selectedText}[^"]*"`);
							const fullAttributeMatch = selectedLineText.match(attributeRegex);

							if (fullAttributeMatch) {
								const attributeName = fullAttributeMatch[1];
								const replacementText = `:${attributeName}="t.${selectedTextReplacement}"`;
								const attributeStartIndex = selectedLineText.indexOf(fullAttributeMatch[0]);
								const rangeToReplace = new vscode.Range(
									new vscode.Position(selection.start.line, attributeStartIndex),
									new vscode.Position(selection.start.line, attributeStartIndex + fullAttributeMatch[0].length)
								);
								editBuilder.replace(rangeToReplace, replacementText);
							}
						} else {
							editBuilder.replace(selection, `{{ t.${selectedTextReplacement} }}`);
						}
					} else {
						editBuilder.replace(selection, `this.t.${selectedTextReplacement}`);
					}
				});
			} catch (error) {
				vscode.window.showErrorMessage(`vue-i18n-no-dep: Error getting translations: ${error}`);
			}
		}
	});

	context.subscriptions.push(addTranslationDisposable);

	let workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
	if (!workspaceFolder) {
		vscode.window.showErrorMessage("vue-i18n-no-dep: Please open a workspace or folder.");
		return;
	}

	let config = vscode.workspace.getConfiguration('myExtension');
	let translationFilePath = config.get<string>('translationFilePath') || 'src/utils/i18n.ts';

	if (!validateTranslationFilePath(workspaceFolder, translationFilePath)) {

		return;
	}
}

function isVueAttributeValue(lineText: string, selectedText: string): boolean {
	const regexPattern = new RegExp(`[a-zA-Z-]+=".*?${selectedText}.*?"`);
	return regexPattern.test(lineText);
}

function isTextInTemplate(documentText: string, selectedLine: number): boolean {
	const lines = documentText.split(EOL);
	let inTemplate = false;

	for (let i = 0; i < lines.length; i++) {
		if (lines[i].includes('<template>')) {
			inTemplate = true;
		}
		if (lines[i].includes('</template>')) {
			inTemplate = false;
		}
		if (i === selectedLine) {
			break;
		}
	}

	return inTemplate;
}

async function getTranslationsFromGPT(apiKey: string, text: string): Promise<{ camelizedKey: string, englishTranslation: string, frenchTranslation: string, translationType: string, camelCaseCall: string | null }> {
	const openai = new OpenAI({
		apiKey: apiKey
	});

	try {
		const response = await openai.chat.completions.create({
			model: "gpt-4-1106-preview",
			response_format: { "type": "json_object" },
			messages: [
				{
					role: "system",
					content: "Translate the given text into English and French. Provide a camelCase key, the translations (e.g., if type is string then \"\"Current subscription\"\" and if type is (n: number) => string then \"(n) => `Current subscription number %{n}`\", the type of translation (e.g., string, (n: number) => string), (s: string) => string), and the camelCaseCall (e.g., myCamelCaseFunction(param1) or null if there is no params). Return the response in JSON format: { camelizedKey: string, englishTranslation: string, frenchTranslation: string, translationType: string, camelCaseCall: string | null}."
				},
				{
					role: "user",
					content: text
				}
			]
		});

		console.log(response.choices[0].message.content);

		const obj = response.choices[0].message.content ? JSON.parse(response.choices[0].message.content) : null;
		return obj;
	} catch (error) {
		if (error instanceof OpenAI.APIConnectionError) {
			vscode.window.showErrorMessage('vue-i18n-no-dep: Network connection error. Please check your internet connection.');
		} else if (error instanceof OpenAI.RateLimitError) {
			vscode.window.showErrorMessage('vue-i18n-no-dep: Rate limit exceeded. Please try again later.');
		} else if (error instanceof OpenAI.AuthenticationError) {
			vscode.window.showErrorMessage('vue-i18n-no-dep: Authentication failed. Please check your API key.');
		} else if (error instanceof OpenAI.APIError) {
			vscode.window.showErrorMessage('vue-i18n-no-dep: An API error occurred: ' + error.message);
		} else {
			vscode.window.showErrorMessage('vue-i18n-no-dep: unknown error occurred');
		}

		throw error;
	}
}

function promptForApiKey(context: vscode.ExtensionContext) {
	vscode.window.showInputBox({
		prompt: 'Enter your OpenAI GPT API Key',
		placeHolder: 'API Key',
		ignoreFocusOut: true
	}).then(value => {
		if (value) {
			context.globalState.update('gptApiKey', value);
			vscode.window.showInformationMessage('vue-i18n-no-dep: API Key saved!');
		}
	});
}

function validateTranslationFilePath(workspaceFolder: string, filePath: string) {
	// Construct the absolute path
	const absoluteFilePath = path.join(workspaceFolder, filePath);

	if (!fs.existsSync(absoluteFilePath)) {
		vscode.window.showErrorMessage(`vue-i18n-no-dep: Translation file not found at path: ${absoluteFilePath}`);
		return false;
	}

	if (path.extname(absoluteFilePath) !== '.ts') {
		vscode.window.showErrorMessage('vue-i18n-no-dep: The translation file must be a TypeScript (.ts) file.');
		return false;
	}

	return true;
}

export function deactivate() { }

function modifyTranslationFile(filePath: string, newKey: string, newValueEn: string, newValueFr: string, translationType: string) {
	fs.readFile(filePath, 'utf8', (err, data) => {
		if (err) {
			vscode.window.showErrorMessage(`vue-i18n-no-dep: Error reading file: ${err.message}`);
			return;
		}

		if (isKeyPresent(data, newKey)) {
			vscode.window.showWarningMessage(`vue-i18n-no-dep: ${newKey} key already exists`);
			return;
		}

		let modifiedData = addTranslationInAlphabeticalOrder(data, newKey, newValueEn, newValueFr, translationType);

		fs.writeFile(filePath, modifiedData, 'utf8', (err) => {
			if (err) {
				vscode.window.showErrorMessage(`vue-i18n-no-dep: Error writing file: ${err.message}`);
			} else {
				vscode.window.showInformationMessage('vue-i18n-no-dep: Translation file updated successfully.');
			}
		});
	});
}

function isKeyPresent(data: string, key: string): boolean {
	return data.includes(` ${key}: `);
}

function addTranslationInAlphabeticalOrder(data: string, newKey: string, newValueEn: string, newValueFr: string, translationType: string): string {
	let lines = data.split(EOL);

	function insertInOrder(sectionIndex: number, key: string, value: string, isTypeSection = false) {
		if (sectionIndex !== -1) {
			let sectionEndIndex = lines.indexOf('};', sectionIndex);
			let insertIndex = sectionIndex + 1;
			for (let i = sectionIndex + 1; i < sectionEndIndex; i++) {
				let line = lines[i].trim();
				let comparisonKey = line.split(':')[0].trim();
				if (line.startsWith(key) || key < comparisonKey) {
					insertIndex = i;
					break;
				}
			}

			let newLine;
			if (isTypeSection) {
				newLine = `    ${key}: ${translationType};`;
			} else if (translationType === 'string') {
				newLine = `    ${key}: "${value}",`;
			} else {
				newLine = `    ${key}: ${value},`;
			}
			lines.splice(insertIndex, 0, newLine);
		}
	}

	// Insert the new key and value in the Texts type, English and French texts
	insertInOrder(lines.findIndex(line => line.includes('export type Texts = {')), newKey, '', true);
	insertInOrder(lines.findIndex(line => line.includes('const texts_en: Texts = {')), newKey, newValueEn);
	insertInOrder(lines.findIndex(line => line.includes('const texts_fr: Texts = {')), newKey, newValueFr);

	return lines.join(EOL);
}