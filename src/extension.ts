import {
  languages,
  ExtensionContext,
  TextDocument,
  Position,
  Hover,
  DocumentSelector,
  RelativePattern,
  workspace,
  WorkspaceFolder,
  CompletionItem,
  CompletionItemKind,
  Location,
  LocationLink,
  Uri,
} from "vscode";
// import { join, dirname } from "path";

export function activate(context: ExtensionContext) {
  workspace.workspaceFolders?.forEach((folder) => {
    initializeListenersForFolder(context, folder);
  });
  workspace.onDidChangeWorkspaceFolders((event) => {
    event.added.forEach((folder) => {
      initializeListenersForFolder(context, folder);
    });
  });
}

const PACKAGE_WORD_RANGE_REGEX = /"%[a-zA-Z0-9\.\-]+%"/;
const NLS_WORD_RANGE_REGEX = /"[a-zA-Z0-9\.\-]+"/;

function initializeListenersForFolder(context: ExtensionContext, folder: WorkspaceFolder) {
  let packageJsonSelector: DocumentSelector = {
    scheme: "file",
    pattern: new RelativePattern(folder, "**/package.json"),
  };

  let folderUri = folder.uri;
  //let packageNlsUri = folderUri.with({path:join(folderUri.path, "package.nls.json")});

  context.subscriptions.push(
    languages.registerHoverProvider(packageJsonSelector, {
      provideHover: async (document: TextDocument, position: Position) => {
        // vscode-nls only accepts an externalization in the package.json if it is in the form
        // "key" : "%some.key%"
        // in which case `word` would be "%some.key%" (quotes included) when hovering over the nls key

        // The following cases aren't accepted by vscode-nls, so we can ignore them
        // "key" : "Plain text %some.key%"
        // "key" : "%externalization key with spaces%"

        let wordRange = document.getWordRangeAtPosition(position, PACKAGE_WORD_RANGE_REGEX);
        if (!wordRange) {
          return undefined;
        }
        let word = document.getText(wordRange);
        if (word.length > 4 && word.startsWith('"%') && word.endsWith('%"')) {
          let nlsKey = word.slice(2, word.length - 2);

          let nlsDocument = await getNlsDocumentForPackage(document);
          if (!nlsDocument) {
            return new Hover(`No package.nls.json found at ${getRelativeNlsDocumentForPackage(document.uri).fsPath}`);
          }
          let nlsDocumentJson = await getDocumentContentAsJson(nlsDocument);
          if (!nlsDocumentJson) {
            return new Hover(`Could not read the package.nls.json file at ${getRelativeNlsDocumentForPackage(document.uri).fsPath}`);
          }
          if (nlsDocumentJson.hasOwnProperty(nlsKey)) {
            return new Hover(nlsDocumentJson[nlsKey]);
          } else {
            return new Hover(`The key ${nlsKey} was not found in the package.nls.json file`);
          }
        }
        return undefined;
      },
    })
  );
  context.subscriptions.push(
    languages.registerCompletionItemProvider(
      packageJsonSelector,
      {
        resolveCompletionItem: (item) => {
          return item;
        },

        provideCompletionItems: async (document, position, token, context): Promise<CompletionItem[]> => {
          let textLine = document.lineAt(position);
          let wordRange = document.getWordRangeAtPosition(position, /"%[a-zA-Z0-9\.\-]*/);
          if (!wordRange) {
            return [];
          }
          let word = document.getText(wordRange);
          let colonIndex = textLine.text.lastIndexOf(":");

          // check that the word starts with "% and is a json value not a key
          if (word.length > 1 && word.startsWith('"%') && colonIndex !== -1 && colonIndex < position.character) {
            let keyPrefix = word.slice(2);
            if (keyPrefix.endsWith('"')) {
              keyPrefix = keyPrefix.slice(0, -1);
            }
            let nlsDocument = await getNlsDocumentForPackage(document);
            if (!nlsDocument) {
              return Promise.resolve([]);
            }
            let nlsJson = await getDocumentContentAsJson(nlsDocument);
            let matches: string[] = [];
            Object.keys(nlsJson).forEach((key) => {
              if (key.startsWith(keyPrefix)) {
                matches.push(key);
              }
            });
            let completionItems: CompletionItem[] = [];
            matches.forEach((match) => {
              let completionItem = new CompletionItem(`\"%${match}%\"`);
              completionItem.kind = CompletionItemKind.Value;
              completionItem.detail = nlsJson[match];
              completionItems.push(completionItem);
            });
            return Promise.resolve(completionItems);
          }
          return Promise.resolve([]);
        },
      },
      "%",
      "."
    )
  );

  context.subscriptions.push(
    languages.registerDefinitionProvider(packageJsonSelector, {
      provideDefinition: async (document, position, token): Promise<Location | Location[] | LocationLink[] | undefined> => {
        let wordRange = document.getWordRangeAtPosition(position, PACKAGE_WORD_RANGE_REGEX);
        if (!wordRange) {
          return undefined;
        }
        let word = document.getText(wordRange);
        if (word.length > 4 && word.startsWith('"%') && word.endsWith('%"')) {
          let nlsKey = word.slice(2, word.length - 2);
          let nlsDocument = await getNlsDocumentForPackage(document);
          if (!nlsDocument) {
            return undefined;
          }
          let keyIndex = nlsDocument.getText().indexOf('"' + nlsKey + '"');
          if (keyIndex < 0) {
            return undefined;
          }
          let nlsKeyWordRange = nlsDocument.getWordRangeAtPosition(nlsDocument.positionAt(keyIndex), NLS_WORD_RANGE_REGEX);
          if (!nlsKeyWordRange) {
            return undefined;
          }
          return new Location(getRelativeNlsDocumentForPackage(document.uri), nlsKeyWordRange);
        }
        return undefined;
      },
    })
  );
}

function getRelativeNlsDocumentForPackage(packageJsonPath: Uri): Uri {
  return packageJsonPath.with({ path: Uri.joinPath(getParentFolder(packageJsonPath), "package.nls.json").fsPath });
}

async function getNlsDocumentForPackage(packageJson: TextDocument): Promise<TextDocument | undefined> {
  let packageNlsUri = getRelativeNlsDocumentForPackage(packageJson.uri);
  try {
    return await workspace.openTextDocument(packageNlsUri);
  } catch (error) {
    return undefined;
  }
}

async function getDocumentContentAsJson(document: TextDocument): Promise<any | undefined> {
  let nlsDocumentContent: any | undefined;
  try {
    nlsDocumentContent = JSON.parse(document.getText());
  } catch (error) {
    return undefined;
  }
  return nlsDocumentContent;
}

function getParentFolder(uri) {
  var a = uri.toString().split("/");
  a.pop();
  return vscode.Uri.parse(a.join("/"));
}

export function deactivate() {}
