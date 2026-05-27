"use client";

import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListItemNode,
  ListNode,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  type EditorState,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
  REDO_COMMAND,
  SELECTION_CHANGE_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Braces,
  Eye,
  EyeOff,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type RichEmailEditorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  previewDescription?: string;
};

const editorTheme = {
  list: {
    listitem: "ml-6",
    nested: {
      listitem: "list-none",
    },
    ol: "list-decimal space-y-1",
    ul: "list-disc space-y-1",
  },
  paragraph: "mb-3 last:mb-0",
  text: {
    bold: "font-semibold",
    italic: "italic",
    underline: "underline",
  },
};

const PLACEHOLDERS = [
  { label: "Contact name", value: "{{ contact.name }}" },
  { label: "First name", value: "{{ contact.firstName }}" },
  { label: "Email", value: "{{ contact.email }}" },
  { label: "City", value: "{{ contact.city }}" },
  { label: "Country", value: "{{ contact.country }}" },
  { label: "Phone", value: "{{ contact.phone }}" },
] as const;

const importHtml = (editor: LexicalEditor, html: string) => {
  const parser = new DOMParser();
  const dom = parser.parseFromString(html || "<p></p>", "text/html");
  const nodes = $generateNodesFromDOM(editor, dom);
  const root = $getRoot();
  root.clear();
  root.append(...nodes);
};

const EditablePlugin = ({ disabled }: { disabled?: boolean }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  return null;
};

const ToolbarButton = ({
  active,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <Button
    type="button"
    variant={active ? "secondary" : "ghost"}
    size="icon"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className="h-8 w-8"
  >
    {children}
  </Button>
);

const ToolbarPlugin = ({ disabled }: { disabled?: boolean }) => {
  const [editor] = useLexicalComposerContext();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
  });

  useEffect(() => {
    const updateToolbar = () => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        setFormats({ bold: false, italic: false, underline: false });
        return;
      }

      setFormats({
        bold: selection.hasFormat("bold"),
        italic: selection.hasFormat("italic"),
        underline: selection.hasFormat("underline"),
      });
    };

    return editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        updateToolbar();
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor]);

  useEffect(() => {
    const unregisterUndo = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (payload) => {
        setCanUndo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );
    const unregisterRedo = editor.registerCommand(
      CAN_REDO_COMMAND,
      (payload) => {
        setCanRedo(payload);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      unregisterUndo();
      unregisterRedo();
    };
  }, [editor]);

  return (
    <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-2">
      <ToolbarButton
        label="Undo"
        disabled={disabled || !canUndo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      >
        <Undo2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={disabled || !canRedo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      >
        <Redo2 className="h-4 w-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Bold"
        active={formats.bold}
        disabled={disabled}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={formats.italic}
        disabled={disabled}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={formats.underline}
        disabled={disabled}
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")}
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Bullet list"
        disabled={disabled}
        onClick={() =>
          editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
        }
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        disabled={disabled}
        onClick={() =>
          editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
        }
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        label="Align left"
        disabled={disabled}
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left")}
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Align center"
        disabled={disabled}
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center")}
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        label="Align right"
        disabled={disabled}
        onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right")}
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className="h-8 gap-2 px-2"
          >
            <Braces className="h-4 w-4" />
            Placeholders
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {PLACEHOLDERS.map((placeholder) => (
            <DropdownMenuItem
              key={placeholder.value}
              onSelect={() => {
                editor.update(() => {
                  const selection = $getSelection();
                  if ($isRangeSelection(selection)) {
                    selection.insertText(placeholder.value);
                  }
                });
              }}
            >
              <span>{placeholder.label}</span>
              <code className="ml-2 text-xs text-muted-foreground">
                {placeholder.value}
              </code>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

const HtmlChangePlugin = ({
  onChange,
}: {
  onChange: (value: string) => void;
}) => {
  const [editor] = useLexicalComposerContext();

  return (
    <OnChangePlugin
      ignoreSelectionChange
      onChange={(editorState: EditorState) => {
        editorState.read(() => {
          const root = $getRoot();
          const textContent = root.getTextContent().trim();
          onChange(textContent ? $generateHtmlFromNodes(editor) : "");
        });
      }}
    />
  );
};

export function RichEmailEditor({
  value,
  onChange,
  disabled,
  id,
  previewDescription = "Rich text is converted to HTML before sending.",
}: RichEmailEditorProps) {
  const [isPreview, setIsPreview] = useState(false);
  const initialConfig = useMemo(
    () => ({
      editable: !disabled,
      editorState: (editor: LexicalEditor) => {
        importHtml(editor, value);
      },
      namespace: "rich-email-editor",
      nodes: [ListNode, ListItemNode],
      onError(error: Error) {
        throw error;
      },
      theme: editorTheme,
    }),
    [disabled, value],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{previewDescription}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => setIsPreview((current) => !current)}
          className="shrink-0 gap-2"
        >
          {isPreview ? (
            <>
              <EyeOff className="h-4 w-4" />
              Edit
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              Preview
            </>
          )}
        </Button>
      </div>

      {isPreview ? (
        <iframe
          title="Email preview"
          sandbox=""
          className="min-h-60 w-full rounded-lg border bg-white"
          srcDoc={value}
        />
      ) : (
        <LexicalComposer initialConfig={initialConfig}>
          <EditablePlugin disabled={disabled} />
          <div
            id={id}
            className={cn(
              "overflow-hidden rounded-lg border bg-background shadow-xs",
              disabled && "opacity-60",
            )}
          >
            <ToolbarPlugin disabled={disabled} />
            <div className="relative">
              <RichTextPlugin
                contentEditable={
                  <ContentEditable className="min-h-56 px-3.5 py-3 text-sm outline-none" />
                }
                placeholder={
                  <p className="pointer-events-none absolute left-3.5 top-3 text-sm text-muted-foreground">
                    Write your email here...
                  </p>
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              <HistoryPlugin />
              <ListPlugin />
              <HtmlChangePlugin onChange={onChange} />
            </div>
          </div>
        </LexicalComposer>
      )}
    </div>
  );
}