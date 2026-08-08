import { useMemo } from 'react';
import { Commit } from '@/types';
import { getBranchColor, formatDate, truncate } from './utils'; // we'll need to move helpers to a utils file
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuGroup } from '@/components/ui/context-menu';

const ROW_HEIGHT = 72;
const DOT_X = 40;
const DOT_R = 7;
const LINE_X = DOT_X;
const CARD_X = DOT_X + 24;
const CARD_HEIGHT = 56;
const CARD_WIDTH = 560;
const SVG_WIDTH = CARD_X + CARD_WIDTH + 24;
const HEADER_OFFSET = 40;

interface CommitRow {
  commit: Commit;
  y: number;
  isLatest: boolean;
}

interface CommitGraphProps {
  commits: Commit[];
  activeBranch: string;
  handleCommitClick: (hash: string) => void;
  handleCheckoutCommit: (hash: string) => void;
  setNewBranchDialog: (state: { open: boolean; startHash?: string }) => void;
  handleRevertCommit: (hash: string) => void;
  handleCherryPick: (hash: string) => void;
  promptReset: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void;
}

export default function CommitGraph({
  commits,
  activeBranch,
  handleCommitClick,
  handleCheckoutCommit,
  setNewBranchDialog,
  handleRevertCommit,
  handleCherryPick,
  promptReset,
}: CommitGraphProps) {
  const rows: CommitRow[] = useMemo(() => commits.map((c, i) => ({
    commit: c,
    y: HEADER_OFFSET + i * ROW_HEIGHT + ROW_HEIGHT / 2,
    isLatest: i === 0,
  })), [commits]);

  const svgHeight = HEADER_OFFSET + commits.length * ROW_HEIGHT + 24;

  if (commits.length === 0) return null;

  return (
    <svg
      width={SVG_WIDTH}
      height={svgHeight}
      style={{ overflow: 'visible', display: 'block' }}
    >
      <line
        x1={LINE_X}
        y1={HEADER_OFFSET + ROW_HEIGHT / 2}
        x2={LINE_X}
        y2={svgHeight - 24}
        stroke={getBranchColor(activeBranch)}
        strokeWidth={3}
        strokeLinecap="round"
      />

      {rows.map((row) => (
        <g key={row.commit.hash}>
          <circle cx={DOT_X} cy={row.y} r={DOT_R} fill={getBranchColor(activeBranch)} stroke="#0a0a0a" strokeWidth={3} />
          <line x1={DOT_X + DOT_R} y1={row.y} x2={CARD_X} y2={row.y} stroke={getBranchColor(activeBranch)} strokeWidth={1.5} strokeOpacity={0.4} />
          
          {row.isLatest && (
            <foreignObject x={DOT_X - 26} y={row.y - 42} width={52} height={22}>
              <div
                style={{
                  background: getBranchColor(activeBranch), color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px',
                  textAlign: 'center', fontFamily: 'Inter, sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', whiteSpace: 'nowrap', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', width: '100%'
                }}
              >
                {activeBranch}
              </div>
            </foreignObject>
          )}

          <foreignObject x={CARD_X} y={row.y - CARD_HEIGHT / 2} width={CARD_WIDTH} height={CARD_HEIGHT}>
            <ContextMenu>
              <ContextMenuTrigger>
                <div
                  onClick={() => handleCommitClick(row.commit.hash)}
                  className="flex items-center justify-between h-full px-4 border border-zinc-700/50 rounded-lg cursor-pointer transition-colors hover:border-zinc-500"
                  style={{ background: !row.isLatest ? '#1a1a1a' : '#141414', boxSizing: 'border-box' }}
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-900/30 text-blue-400 text-[10px] font-mono px-1.5 py-0.5 rounded border border-blue-800/30 shrink-0">
                        {row.commit.hash.substring(0, 7)}
                      </span>
                      <span className="text-zinc-200 text-[13px] font-medium truncate" title={row.commit.subject}>
                        {truncate(row.commit.subject, 60)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-[9px] font-bold shrink-0">
                        {row.commit.author.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-zinc-400 text-[11px] whitespace-nowrap">{truncate(row.commit.author, 18)}</span>
                    </div>
                    <span className="text-zinc-500 text-[10px] whitespace-nowrap">{formatDate(row.commit.date)}</span>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-56 bg-zinc-800 border-zinc-700 text-zinc-200">
                <ContextMenuGroup>
                  <ContextMenuItem onClick={() => handleCheckoutCommit(row.commit.hash)}>Checkout a este commit</ContextMenuItem>
                  <ContextMenuItem onClick={() => setNewBranchDialog({ open: true, startHash: row.commit.hash })}>Crear rama desde aquí</ContextMenuItem>
                  <ContextMenuItem onClick={() => handleRevertCommit(row.commit.hash)}>Revertir commit</ContextMenuItem>
                  <ContextMenuItem onClick={() => handleCherryPick(row.commit.hash)}>Cherry-pick</ContextMenuItem>
                  <ContextMenuSeparator className="bg-zinc-700" />
                  <ContextMenuSub>
                    <ContextMenuSubTrigger className="text-orange-400">Reset commit</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="bg-zinc-800 border-zinc-700 text-zinc-200">
                      <ContextMenuGroup>
                        <ContextMenuItem onClick={() => promptReset(row.commit.hash, 'soft')}>Reset --soft</ContextMenuItem>
                        <ContextMenuItem onClick={() => promptReset(row.commit.hash, 'mixed')}>Reset --mixed</ContextMenuItem>
                        <ContextMenuItem onClick={() => promptReset(row.commit.hash, 'hard')} className="text-red-400">Reset --hard</ContextMenuItem>
                      </ContextMenuGroup>
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                </ContextMenuGroup>
              </ContextMenuContent>
            </ContextMenu>
          </foreignObject>
        </g>
      ))}
    </svg>
  );
}
