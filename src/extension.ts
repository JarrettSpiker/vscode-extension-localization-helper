import {languages, ExtensionContext, TextDocument, Position, Hover, DocumentSelector, RelativePattern, workspace, WorkspaceFolder} from "vscode";
import { join } from "path";

export function activate(context: ExtensionContext) {

	workspace.workspaceFolders?.forEach(folder => {
		let packageJsonSelector : DocumentSelector = {
			scheme : "file",
			pattern : new RelativePattern(folder , "package.json")
		};
		
		let folderUri = folder.uri;
		let packageNlsUri = folderUri.with({path:join(folderUri.path, "package.nls.json")})

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
