
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
	let openSettingsDisposable = vscode.commands.registerCommand('i18n-charlon.openSettings', () => {
		vscode.commands.executeCommand('workbench.action.openSettings', 'myExtension');
	});
	context.subscriptions.push(openSettingsDisposable);

	let addTranslationDisposable = vscode.commands.registerTextEditorCommand('i18n-charlon.addTranslation', async (textEditor, edit) => {
		const selections = textEditor.selections;
		let apiKey = context.globalState.get<string>('gptApiKey');
		if (!apiKey) {
			vscode.window.showWarningMessage('i18n-charlon: GPT API Key is not set. Please set it in the extension settings.');
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
			const languageId = textEditor.document.languageId;

			if (!selectedText) {
				vscode.window.showWarningMessage('i18n-charlon: No text selected.');
				continue;
			}

			try {
				let { camelizedKey, englishTranslation, frenchTranslation } = await getTranslationsFromGPT(apiKey, selectedText);

				modifyTranslationFile(translationFilePath, camelizedKey, englishTranslation, frenchTranslation);

				await textEditor.edit(editBuilder => {
					const selectedLineText = textEditor.document.lineAt(selection.start.line).text;
					const isInTemplate = isTextInTemplate(documentText, selection.start.line);

					if (isInTemplate) {
						if (isVueAttributeValue(selectedLineText, selectedText)) {
							const attributeRegex = new RegExp(`([a-zA-Z-]+)="[^"]*${selectedText}[^"]*"`);
							const fullAttributeMatch = selectedLineText.match(attributeRegex);

							if (fullAttributeMatch) {
								const attributeName = fullAttributeMatch[1];
								const replacementText = `:${attributeName}="t.${camelizedKey}"`;
								const attributeStartIndex = selectedLineText.indexOf(fullAttributeMatch[0]);
								const rangeToReplace = new vscode.Range(
									new vscode.Position(selection.start.line, attributeStartIndex),
									new vscode.Position(selection.start.line, attributeStartIndex + fullAttributeMatch[0].length)
								);
								editBuilder.replace(rangeToReplace, replacementText);
							}
						} else {
							editBuilder.replace(selection, `{{ t.${camelizedKey} }}`);
						}
					} else {
						editBuilder.replace(selection, `this.t.${camelizedKey}`);
					}
				});
			} catch (error) {
				vscode.window.showErrorMessage(`Error getting translations: ${error}`);
			}
		}
	});

	context.subscriptions.push(addTranslationDisposable);


	let workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
	if (!workspaceFolder) {
		vscode.window.showErrorMessage("Please open a workspace or folder.");
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


function extractVueAttributeName(lineText: string, selectedText: string): string | null {
	const vueAttributeRegex = new RegExp(`([a-zA-Z-]*)="${selectedText}"`);
	const match = vueAttributeRegex.exec(lineText);
	return match ? match[1] : null;
}

function getAttributeRange(lineText: string, attributeName: string | null, lineNum: number, document: vscode.TextDocument): vscode.Range {
	const attributePattern = new RegExp(`${attributeName}="[^"]*"`);
	const match = attributePattern.exec(lineText);
	if (match) {
		const start = new vscode.Position(lineNum, match.index);
		const end = new vscode.Position(lineNum, match.index + match[0].length);
		return new vscode.Range(start, end);
	}
	return new vscode.Range(new vscode.Position(lineNum, 0), new vscode.Position(lineNum, 0));
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

async function getTranslationsFromGPT(apiKey: string, text: string): Promise<{ camelizedKey: string, englishTranslation: string, frenchTranslation: string }> {
	const openai = new OpenAI({
		apiKey: apiKey
	});

	try {
		const response = await openai.chat.completions.create({
			model: "gpt-4-1106-preview",
			response_format: { "type": "json_object" }, // Enable JSON mode
			messages: [
				{
					role: "system",
					content: "Translate the given text into English and French, and provide a camelCase version of the English translation. Return the response in JSON : { camelizedKey: string, englishTranslation: string, frenchTranslation: string }."
				},
				{
					role: "user",
					content: text
				}
			]
		});

		console.log(response.choices[0].message.content);

		const obj = response.choices[0].message.content ? JSON.parse(response.choices[0].message.content) : null;
		return obj
			;
	} catch (error) {
		if (error instanceof OpenAI.APIConnectionError) {
			vscode.window.showErrorMessage('Network connection error. Please check your internet connection.');
		} else if (error instanceof OpenAI.RateLimitError) {
			vscode.window.showErrorMessage('Rate limit exceeded. Please try again later.');
		} else if (error instanceof OpenAI.AuthenticationError) {
			vscode.window.showErrorMessage('Authentication failed. Please check your API key.');
		} else if (error instanceof OpenAI.APIError) {
			vscode.window.showErrorMessage('An API error occurred: ' + error.message);
		} else {
			vscode.window.showErrorMessage('unknown error occurred');
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
			vscode.window.showInformationMessage('API Key saved!');
		}
	});
}

function validateTranslationFilePath(workspaceFolder: string, filePath: string) {
	// Construct the absolute path
	const absoluteFilePath = path.join(workspaceFolder, filePath);

	if (!fs.existsSync(absoluteFilePath)) {
		vscode.window.showErrorMessage(`Translation file not found at path: ${absoluteFilePath}`);
		return false;
	}

	if (path.extname(absoluteFilePath) !== '.ts') {
		vscode.window.showErrorMessage('The translation file must be a TypeScript (.ts) file.');
		return false;
	}

	return true;
}

export function deactivate() { }

function modifyTranslationFile(filePath: string, newKey: string, newValueEn: string, newValueFr: string) {
	fs.readFile(filePath, 'utf8', (err, data) => {
		if (err) {
			vscode.window.showErrorMessage(`Error reading file: ${err.message}`);
			return;
		}

		if (isKeyPresent(data, newKey)) {
			vscode.window.showWarningMessage(`i18n-charlon: ${newKey} key already exists`);
			return;
		}

		let modifiedData = addTranslationInAlphabeticalOrder(data, newKey, newValueEn, newValueFr);

		fs.writeFile(filePath, modifiedData, 'utf8', (err) => {
			if (err) {
				vscode.window.showErrorMessage(`Error writing file: ${err.message}`);
			} else {
				vscode.window.showInformationMessage('Translation file updated successfully.');
			}
		});
	});
}

function isKeyPresent(data: string, key: string): boolean {
	return data.includes(` ${key}: `);
}



function addTranslationInAlphabeticalOrder(data: string, newKey: string, newValueEn: string, newValueFr: string): string {
	let lines = data.split(EOL);

	function insertInOrder(sectionIndex: number, key: string, value: string, isTypeSection = false) {
		if (sectionIndex !== -1) {
			let sectionEndIndex = lines.indexOf('};', sectionIndex);
			let insertIndex = sectionIndex + 1;
			for (let i = sectionIndex + 1; i < sectionEndIndex; i++) {
				let line = lines[i].trim();
				let comparisonKey = isTypeSection ? line.split(':')[0].trim() : line.split(':')[0].trim();
				if (line.startsWith(key) || key < comparisonKey) {
					insertIndex = i;
					break;
				}
			}
			let newLine = isTypeSection ? `    ${key}: NoParamString;` : `    ${key}: "${value}",`;
			lines.splice(insertIndex, 0, newLine);
		}
	}

	insertInOrder(lines.findIndex(line => line.includes('export type Texts = {')), newKey, '', true);
	insertInOrder(lines.findIndex(line => line.includes('const texts_en: Texts = {')), newKey, newValueEn);
	insertInOrder(lines.findIndex(line => line.includes('const texts_fr: Texts = {')), newKey, newValueFr);

	return lines.join(EOL);
}