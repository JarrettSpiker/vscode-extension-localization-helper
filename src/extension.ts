import {languages, ExtensionContext, TextDocument, Position, Hover, DocumentSelector, RelativePattern, workspace, WorkspaceFolder, CompletionItem, CompletionItemKind, ProviderResult, Location, LocationLink} from "vscode";
import { join } from "path";

export function activate(context: ExtensionContext) {

	workspace.workspaceFolders?.forEach(folder => {
		let packageJsonSelector : DocumentSelector = {
			scheme : "file",
			pattern : new RelativePattern(folder , "package.json")
		};
		
		let folderUri = folder.uri;
		let packageNlsUri = folderUri.with({path:join(folderUri.path, "package.nls.json")});

		context.subscriptions.push(languages.registerHoverProvider(packageJsonSelector, {
			provideHover : async (document: TextDocument, position: Position) => {
				// vscode-nls only accepts an externalization in the package.json if it is in the form
				// "key" : "%some.key%"
				// in which case `word` would be "%some.key%" (quotes included) when hovering over the nls key

				// The following cases aren't accepted by vscode-nls, so we can ignore them
				// "key" : "Plain text %some.key%" 
				// "key" : "%externalization key with spaces%" 

				let wordRange = document.getWordRangeAtPosition(position);
				let word = document.getText(wordRange);
				if(word.length > 4 && word.startsWith('"%') && word.endsWith('%"')){
					let nlsKey = word.slice(2, word.length-2);
					let nlsDocument = await getNlsDocumentForFolder(folder);
					if(!nlsDocument) {
						return new Hover(`No package.nls.json found at ${packageNlsUri.fsPath}`);
					}
					let nlsDocumentJson = await getDocumentContentAsJson(nlsDocument);
					if(!nlsDocumentJson){
						return new Hover(`Could not read the package.nls.json file at ${packageNlsUri.fsPath}`);
					}
					if(nlsDocumentJson.hasOwnProperty(nlsKey)){
						return new Hover(nlsDocumentJson[nlsKey]);
					} else {
						return new Hover(`The key ${nlsKey} was not found in the package.nls.json file`);
					}
				}
				return undefined;
			}
		}));
		context.subscriptions.push(languages.registerCompletionItemProvider(packageJsonSelector, {
			resolveCompletionItem : (item) => {
				return item;
			},

			provideCompletionItems : async (document, position, token, context) : Promise<CompletionItem[]>=>{
				let textLine = document.lineAt(position);
				let wordRange = document.getWordRangeAtPosition(position);
				let word = document.getText(wordRange);
				let colonIndex = textLine.text.lastIndexOf(":");

				// check that the word starts with "% and is a json value not a key
				if(word.length > 1 && word.startsWith('"%') && colonIndex !== -1 && colonIndex < position.character){
					let keyPrefix = word.slice(2);
					if (keyPrefix.endsWith("\"")) {
						keyPrefix = keyPrefix.slice(0, -1);
					}
					let nlsDocument = await getNlsDocumentForFolder(folder);
					if(!nlsDocument) {
						return Promise.resolve([]);
					}
					let nlsJson = await getDocumentContentAsJson(nlsDocument);
					let matches : string[] = [];
					Object.keys(nlsJson).forEach(key => {
						if(key.startsWith(keyPrefix)){
							matches.push(key);
						}
					});
					let completionItems : CompletionItem[] = [];
					matches.forEach(match=> {
						let completionItem = new CompletionItem(`\"%${match}%\"`);
						completionItem.kind = CompletionItemKind.Value;
						completionItem.detail = nlsJson[match];
						completionItems.push(completionItem);
					});
					return Promise.resolve(completionItems);
				}
				return Promise.resolve([]);
			}
		}, "%", "."));

		context.subscriptions.push(languages.registerDefinitionProvider(packageJsonSelector, {
			provideDefinition : async (document, position, token) : Promise<Location|Location[]|LocationLink[]|undefined> => {
				let wordRange = document.getWordRangeAtPosition(position);
				let word = document.getText(wordRange);
				if(word.length > 4 && word.startsWith('"%') && word.endsWith('%"')){
					let nlsKey = word.slice(2, word.length-2);
					let nlsDocument = await getNlsDocumentForFolder(folder);
					if(!nlsDocument) {
						return undefined;
					}
					let keyIndex = nlsDocument.getText().indexOf('"'+nlsKey+'"');
					if(keyIndex < 0) {
						return undefined;
					}
					let nlsKeyWordRange = nlsDocument.getWordRangeAtPosition(nlsDocument.positionAt(keyIndex));
					if(!nlsKeyWordRange) {
						return undefined;
					}
					return new Location(packageNlsUri, nlsKeyWordRange);
				}
				return undefined;
			}
		}));
	});
}

async function getNlsDocumentForFolder(folder:WorkspaceFolder) : Promise<TextDocument | undefined> {
	let folderUri = folder.uri;
	let packageNlsUri = folderUri.with({path:join(folderUri.path, "package.nls.json")});
	try{
		return await workspace.openTextDocument(packageNlsUri);
	} catch (error){
		return undefined;
	}
	
}

async function getDocumentContentAsJson(document:TextDocument) : Promise<any | undefined>{
	let  nlsDocumentContent: any|undefined;
	try {
		nlsDocumentContent = JSON.parse(document.getText());
	} catch (error) {
		return undefined;
	}
	return nlsDocumentContent;
}

export function deactivate() {}
