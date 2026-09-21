import type { GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree, useFileTreeSelector } from "@pierre/trees/react";
import { ChevronsDownUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";

import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { T3_PIERRE_ICONS } from "~/pierre-icons";
import { PIERRE_TREE_UNSAFE_CSS, pierreTreeStyle } from "~/pierre-tree-theme";

import { areAllDirectoriesExpanded, setAllDirectoriesExpanded } from "../files/fileTreeExpansion";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  buildDiffFileTreeUpdates,
  collectDirectoryPaths,
  diffFileTreeModelPaths,
  type DiffFileTreeEntry,
} from "./diffFileTree.logic";

export type { DiffFileTreeEntry } from "./diffFileTree.logic";

interface DiffFileTreeProps {
  readonly entries: ReadonlyArray<DiffFileTreeEntry>;
  /** Called with the file's path when the reader picks a file row. */
  readonly onSelectFile: (path: string) => void;
  /**
   * The file the diff is currently showing, kept selected in the tree. Bump `revealRequestId` to
   * scroll the tree to the same path again.
   */
  readonly selectedPath?: string | null;
  readonly revealRequestId?: number;
  readonly ariaLabel: string;
  /** Right-aligned content in the header row, after the file count. */
  readonly headerAccessory?: ReactNode;
  /** Rendered under the tree, for a host that still has files to fetch. */
  readonly footer?: ReactNode;
  readonly className?: string;
}

/**
 * A directory tree of the files in a diff. Every directory starts open: a diff is a short list
 * compared to a workspace, and the reader came for the files, not the folders.
 *
 * Git can replace a file or symlink with a directory of the same name (and the reverse). Pierre
 * cannot represent both, so those diffs are shown as a flat list instead of crashing the tree.
 */
export function DiffFileTree({
  entries,
  onSelectFile,
  selectedPath = null,
  revealRequestId = 0,
  ariaLabel,
  headerAccessory,
  footer,
  className,
}: DiffFileTreeProps) {
  const { resolvedTheme } = useTheme();
  const paths = useMemo(() => entries.map((entry) => entry.path), [entries]);
  const treePaths = useMemo(() => diffFileTreeModelPaths(paths), [paths]);
  const hasPrefixCollision = treePaths !== paths;
  const directoryPaths = useMemo(() => collectDirectoryPaths(treePaths), [treePaths]);
  const gitStatus = useMemo<ReadonlyArray<GitStatusEntry>>(
    () =>
      hasPrefixCollision
        ? []
        : entries.map((entry) => ({ path: entry.path, status: entry.status })),
    [entries, hasPrefixCollision],
  );
  const filePathsRef = useRef<ReadonlySet<string>>(new Set(paths));
  const onSelectFileRef = useRef(onSelectFile);
  // Selection driven by `selectedPath` below is an echo of a file already on screen, not a
  // request to scroll to it again.
  const syncingSelectionRef = useRef(false);
  const handledRevealRef = useRef<{ path: string; revealRequestId: number } | null>(null);
  const mountedPathsRef = useRef<ReadonlyArray<string> | null>(null);

  useEffect(() => {
    filePathsRef.current = new Set(paths);
    onSelectFileRef.current = onSelectFile;
  }, [onSelectFile, paths]);

  const { model } = useFileTree({
    density: "compact",
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    icons: T3_PIERRE_ICONS,
    onSelectionChange: (selectedPaths) => {
      if (syncingSelectionRef.current) return;
      const path = selectedPaths.at(-1)?.replace(/\/$/, "");
      if (path && filePathsRef.current.has(path)) onSelectFileRef.current(path);
    },
    paths: [],
    search: false,
    unsafeCSS: PIERRE_TREE_UNSAFE_CSS,
  });
  const allDirectoriesExpanded = useFileTreeSelector(model, (currentModel) =>
    areAllDirectoriesExpanded(currentModel, directoryPaths),
  );

  useEffect(() => {
    const mountedPaths = mountedPathsRef.current;
    if (mountedPaths === treePaths) return;
    mountedPathsRef.current = treePaths;
    if (mountedPaths === null) {
      model.resetPaths(treePaths);
    } else {
      const updates = buildDiffFileTreeUpdates(mountedPaths, treePaths);
      if (updates.length > 0) model.batch(updates);
    }
    model.setGitStatus(gitStatus);
  }, [gitStatus, model, treePaths]);

  useEffect(() => {
    if (selectedPath === null) {
      handledRevealRef.current = null;
      return;
    }
    // A path list that changes under an already-revealed file (a refresh, a later slice) must
    // not pull the tree back to it over whatever the reader has picked since.
    if (!treePaths.includes(selectedPath)) {
      // A file that left the diff, or a colliding set shown as a flat list, has to be revealed
      // again when it is back in the tree.
      handledRevealRef.current = null;
      return;
    }
    const item = model.getItem(selectedPath);
    if (item === null || item.isDirectory()) {
      // A file that left the diff has to be revealed again when it comes back.
      handledRevealRef.current = null;
      return;
    }
    const handled = handledRevealRef.current;
    if (handled?.path === selectedPath && handled.revealRequestId === revealRequestId) return;
    handledRevealRef.current = { path: selectedPath, revealRequestId };
    syncingSelectionRef.current = true;
    for (const path of model.getSelectedPaths()) {
      if (path !== selectedPath) model.getItem(path)?.deselect();
    }
    let ancestor = "";
    for (const segment of selectedPath.split("/").slice(0, -1)) {
      ancestor += `${segment}/`;
      const directory = model.getItem(ancestor);
      if (directory !== null && "expand" in directory) directory.expand();
    }
    item.select();
    model.scrollToPath(selectedPath, { offset: "nearest" });
    queueMicrotask(() => {
      syncingSelectionRef.current = false;
    });
  }, [model, revealRequestId, selectedPath, treePaths]);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-background", className)}>
      <div
        className="flex h-10 min-h-10 shrink-0 items-center gap-1 border-b border-border/60 bg-background px-2 text-xs text-muted-foreground in-data-[preview-panel-mode=inline]:mb-3 in-data-[preview-panel-mode=inline]:h-7 in-data-[preview-panel-mode=inline]:min-h-7 in-data-[preview-panel-mode=inline]:border-b-transparent"
        data-surface-subheader
      >
        <span className="px-1 font-medium text-foreground">Files</span>
        <span className="ml-auto tabular-nums">{entries.length}</span>
        {headerAccessory}
        {directoryPaths.length > 0 ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={
                    allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"
                  }
                  onClick={() =>
                    setAllDirectoriesExpanded(model, directoryPaths, !allDirectoriesExpanded)
                  }
                />
              }
            >
              {allDirectoriesExpanded ? (
                <ChevronsDownUpIcon className="size-3.5" />
              ) : (
                <ChevronsUpDownIcon className="size-3.5" />
              )}
            </TooltipTrigger>
            <TooltipPopup>
              {allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"}
            </TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      {hasPrefixCollision ? (
        <DiffFileCollisionList
          entries={entries}
          selectedPath={selectedPath}
          revealRequestId={revealRequestId}
          ariaLabel={ariaLabel}
          onSelectFile={onSelectFile}
        />
      ) : (
        <FileTree
          model={model}
          aria-label={ariaLabel}
          onClickCapture={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            // Pierre does not emit a selection change for its sole selected row.
            // Read selection before the row handles the click so new selections reveal only once.
            const selected = model.getSelectedPaths();
            const path = selected.length === 1 ? selected[0] : undefined;
            if (!path || !filePathsRef.current.has(path)) return;
            const clickedSelectedRow = event.nativeEvent
              .composedPath()
              .some(
                (node) =>
                  node instanceof HTMLElement && node.getAttribute("data-item-path") === path,
              );
            if (clickedSelectedRow) onSelectFileRef.current(path);
          }}
          className="min-h-0 flex-1 overflow-hidden"
          style={pierreTreeStyle(resolvedTheme)}
        />
      )}
      {footer}
    </div>
  );
}

function gitStatusMark(status: DiffFileTreeEntry["status"]): string {
  switch (status) {
    case "added":
      return "A";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    default:
      return "M";
  }
}

function gitStatusMarkClassName(status: DiffFileTreeEntry["status"]): string {
  switch (status) {
    case "added":
      return "text-diff-addition";
    case "deleted":
      return "text-diff-deletion";
    default:
      return "text-muted-foreground";
  }
}

/** Flat fallback when git replaces a file/symlink with a directory of the same name, or the reverse. */
function DiffFileCollisionList({
  entries,
  selectedPath,
  revealRequestId,
  ariaLabel,
  onSelectFile,
}: {
  entries: ReadonlyArray<DiffFileTreeEntry>;
  selectedPath: string | null;
  revealRequestId: number;
  ariaLabel: string;
  onSelectFile: (path: string) => void;
}) {
  const selectedRef = useRef<HTMLButtonElement | null>(null);
  const handledRevealRef = useRef<{ path: string; revealRequestId: number } | null>(null);
  useEffect(() => {
    if (selectedPath === null) {
      handledRevealRef.current = null;
      return;
    }
    const handled = handledRevealRef.current;
    if (handled?.path === selectedPath && handled.revealRequestId === revealRequestId) return;
    handledRevealRef.current = { path: selectedPath, revealRequestId };
    selectedRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [revealRequestId, selectedPath]);

  return (
    <ul className="min-h-0 flex-1 overflow-auto p-1" aria-label={ariaLabel}>
      {entries.map((entry) => {
        const selected = entry.path === selectedPath;
        return (
          <li key={`${entry.path}\0${entry.status}`}>
            <button
              type="button"
              data-item-path={entry.path}
              ref={selected ? selectedRef : undefined}
              aria-current={selected ? "true" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-[5px] px-2 py-0.5 text-left text-xs",
                selected ? "bg-foreground/12" : "hover:bg-foreground/[0.07]",
              )}
              onClick={() => onSelectFile(entry.path)}
            >
              <span className="min-w-0 flex-1 truncate">{entry.path}</span>
              <span
                className={cn(
                  "shrink-0 font-medium tabular-nums",
                  gitStatusMarkClassName(entry.status),
                )}
              >
                {gitStatusMark(entry.status)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
