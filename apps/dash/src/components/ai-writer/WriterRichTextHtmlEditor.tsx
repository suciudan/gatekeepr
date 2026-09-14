'use client'

import type { MouseEvent as ReactMouseEvent } from 'react'
import { useEffect, useRef } from 'react'

type Props = {
  disabled?: boolean
  initialHtml: string
  onChange: (html: string) => void
  resetKey: string
}

function runEditorCommand(command: string, value?: string) {
  document.execCommand(command, false, value)
}

function getRangeInsideElement(element: HTMLElement | null): Range | null {
  if (!element) {
    return null
  }

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return null
  }

  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const containerElement =
    container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement

  if (!containerElement || !element.contains(containerElement)) {
    return null
  }

  return range.cloneRange()
}

function getClosestAnchor(node: Node | null): HTMLAnchorElement | null {
  if (!node) {
    return null
  }

  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement

  return element instanceof Element ? element.closest('a[href]') : null
}

function getSelectedAnchor(editorElement: HTMLElement | null): HTMLAnchorElement | null {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0 || !editorElement) {
    return null
  }

  const range = selection.getRangeAt(0)
  const anchor =
    getClosestAnchor(selection.anchorNode) ??
    getClosestAnchor(selection.focusNode) ??
    getClosestAnchor(range.commonAncestorContainer)

  return anchor && editorElement.contains(anchor) ? anchor : null
}

function restoreRange(range: Range | null) {
  if (!range) {
    return
  }

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function unwrapAnchor(anchor: HTMLAnchorElement) {
  const parent = anchor.parentNode

  if (!parent) {
    return
  }

  while (anchor.firstChild) {
    parent.insertBefore(anchor.firstChild, anchor)
  }

  parent.removeChild(anchor)
}

function ToolbarButton(props: { disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button
      disabled={props.disabled}
      onClick={props.onClick}
      onMouseDown={(event) => {
        event.preventDefault()
      }}
      style={{
        background: 'var(--theme-elevation-0)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '.5rem',
        color: 'var(--theme-text)',
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        fontSize: '.8125rem',
        fontWeight: 600,
        opacity: props.disabled ? 0.55 : 1,
        padding: '.4rem .65rem',
      }}
      type="button"
    >
      {props.label}
    </button>
  )
}

export function WriterRichTextHtmlEditor({ disabled, initialHtml, onChange, resetKey }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const initialHtmlRef = useRef(initialHtml)
  const savedRangeRef = useRef<Range | null>(null)

  useEffect(() => {
    initialHtmlRef.current = initialHtml
  }, [initialHtml])

  useEffect(() => {
    if (!editorRef.current) {
      return
    }

    editorRef.current.innerHTML = initialHtmlRef.current || '<p></p>'
  }, [resetKey])

  function focusEditor() {
    editorRef.current?.focus()
  }

  function saveSelection() {
    savedRangeRef.current = getRangeInsideElement(editorRef.current)
  }

  function restoreEditorSelection() {
    focusEditor()
    restoreRange(savedRangeRef.current)
  }

  function emitChange() {
    onChange(editorRef.current?.innerHTML ?? '')
  }

  function emitChangeSoon() {
    window.setTimeout(() => {
      emitChange()
      saveSelection()
    }, 0)
  }

  function commitEditorMutation() {
    saveSelection()
    emitChange()
    emitChangeSoon()
  }

  function handleToolbarCommand(command: string, value?: string) {
    restoreEditorSelection()
    runEditorCommand(command, value)
    commitEditorMutation()
  }

  function handleLink() {
    if (disabled) {
      return
    }

    restoreEditorSelection()

    const selectedAnchor = getSelectedAnchor(editorRef.current)
    const existingHref = selectedAnchor?.getAttribute('href') ?? ''
    const url = window.prompt(
      'Enter the URL for this link. Leave empty to remove the link:',
      existingHref,
    )

    if (url === null) {
      return
    }

    const normalizedUrl = url.trim()
    restoreEditorSelection()

    if (selectedAnchor) {
      if (normalizedUrl) {
        selectedAnchor.setAttribute('href', normalizedUrl)
      } else {
        unwrapAnchor(selectedAnchor)
      }
    } else if (!normalizedUrl) {
      runEditorCommand('unlink')
    } else {
      runEditorCommand('createLink', normalizedUrl)
    }

    commitEditorMutation()
  }

  function handleEditorClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target : null
    const anchor = target?.closest('a[href]')
    const href = anchor?.getAttribute('href')

    if (!anchor || !href) {
      return
    }

    if (event.metaKey || event.ctrlKey) {
      event.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
    }

    window.setTimeout(saveSelection)
  }

  return (
    <div
      style={{
        background: 'var(--theme-elevation-0)',
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: '.85rem',
        display: 'grid',
        overflow: 'visible',
      }}
    >
      <div className="writer-rich-text-html-editor__toolbar">
        <ToolbarButton
          disabled={disabled}
          label="P"
          onClick={() => handleToolbarCommand('formatBlock', '<p>')}
        />
        <ToolbarButton
          disabled={disabled}
          label="H2"
          onClick={() => handleToolbarCommand('formatBlock', '<h2>')}
        />
        <ToolbarButton
          disabled={disabled}
          label="Bold"
          onClick={() => handleToolbarCommand('bold')}
        />
        <ToolbarButton
          disabled={disabled}
          label="Italic"
          onClick={() => handleToolbarCommand('italic')}
        />
        <ToolbarButton
          disabled={disabled}
          label="Underline"
          onClick={() => handleToolbarCommand('underline')}
        />
        <ToolbarButton
          disabled={disabled}
          label="Bullets"
          onClick={() => handleToolbarCommand('insertUnorderedList')}
        />
        <ToolbarButton
          disabled={disabled}
          label="Numbers"
          onClick={() => handleToolbarCommand('insertOrderedList')}
        />
        <ToolbarButton disabled={disabled} label="Link" onClick={handleLink} />
        <ToolbarButton
          disabled={disabled}
          label="Clear"
          onClick={() => handleToolbarCommand('removeFormat')}
        />
      </div>

      <div
        aria-label="Article body editor"
        contentEditable={!disabled}
        onBlur={saveSelection}
        onClick={handleEditorClick}
        onCut={emitChangeSoon}
        onDrop={emitChangeSoon}
        onInput={() => {
          emitChange()
          saveSelection()
        }}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onPaste={emitChangeSoon}
        ref={editorRef}
        role="textbox"
        style={{
          lineHeight: 1.75,
          minHeight: '40rem',
          outline: 'none',
          overflow: 'auto',
          padding: '1rem 1.1rem 1.25rem',
        }}
        suppressContentEditableWarning
      />

      <style>{`
        [role="textbox"][contenteditable="true"] p {
          margin: 0 0 1.25rem;
        }

        [role="textbox"][contenteditable="true"] h2,
        [role="textbox"][contenteditable="true"] h3,
        [role="textbox"][contenteditable="true"] h4 {
          line-height: 1.25;
          margin: 2rem 0 1rem;
        }

        [role="textbox"][contenteditable="true"] ul,
        [role="textbox"][contenteditable="true"] ol {
          margin: 0 0 1.25rem 1.5rem;
        }

        [role="textbox"][contenteditable="true"] pre {
          background: var(--theme-elevation-50);
          border: 1px solid var(--theme-elevation-150);
          border-radius: .75rem;
          margin: 0 0 1.5rem;
          overflow: auto;
          padding: 1rem 1.25rem;
        }

        [role="textbox"][contenteditable="true"] code {
          font-family: var(--font-mono, monospace);
        }

        [role="textbox"][contenteditable="true"] a {
          cursor: pointer;
        }

        [role="textbox"][contenteditable="true"] p code,
        [role="textbox"][contenteditable="true"] li code,
        [role="textbox"][contenteditable="true"] td code {
          background: var(--theme-elevation-100);
          border-radius: .35rem;
          padding: .1rem .35rem;
        }

        [role="textbox"][contenteditable="true"] table {
          border-collapse: collapse;
          margin: 0 0 1.5rem;
          width: 100%;
        }

        [role="textbox"][contenteditable="true"] th,
        [role="textbox"][contenteditable="true"] td {
          border-bottom: 1px solid var(--theme-elevation-150);
          padding: .85rem 1rem;
          text-align: left;
          vertical-align: top;
        }

        [role="textbox"][contenteditable="true"]:focus {
          background: var(--theme-elevation-0);
        }
      `}</style>
    </div>
  )
}
