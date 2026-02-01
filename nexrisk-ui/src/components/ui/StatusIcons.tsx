export interface TradeStatus {
  isClassified: boolean;
  clusterId: number | null;
  isHedged: boolean;
  isAlgo: boolean;
}

const OFF = '#505060';
const ON = '#e0a020';

export function StatusCell({ data }: { data: TradeStatus }) {
  return (
    <div className="flex items-center gap-2 h-full">
      <svg viewBox="0 0 16 16" className="w-4 h-4" fill={data.isClassified ? ON : OFF}>
        <title>{data.isClassified ? 'Classified' : 'Not Classified'}</title>
        <path d="M8 1C5.2 1 3 3.2 3 6v2c0 2.8 2.2 5 5 5s5-2.2 5-5V6c0-2.8-2.2-5-5-5zm3 7c0 1.7-1.3 3-3 3S5 9.7 5 8V6c0-1.7 1.3-3 3-3s3 1.3 3 3v2z"/>
      </svg>

      <span className="text-[11px] font-mono font-semibold" style={{ color: data.clusterId !== null ? ON : OFF }} title={data.clusterId !== null ? `Cluster ${data.clusterId}` : 'No Cluster'}>
        {data.clusterId !== null ? `C${data.clusterId}` : 'NC'}
      </span>

      <svg viewBox="0 0 16 16" className="w-4 h-4" fill={data.isHedged ? ON : OFF}>
        <title>{data.isHedged ? 'Hedged' : 'Not Hedged'}</title>
        <path d="M8 1L2 4v4c0 3.5 2.5 6.5 6 8 3.5-1.5 6-4.5 6-8V4L8 1zm0 2l4 2v3c0 2.5-1.8 4.8-4 6-2.2-1.2-4-3.5-4-6V5l4-2z"/>
      </svg>

      <svg viewBox="0 0 16 16" className="w-4 h-4" fill={data.isAlgo ? ON : OFF}>
        <title>{data.isAlgo ? 'EA/Bot' : 'Manual'}</title>
        <path d="M11 5H5c-1.1 0-2 .9-2 2v5c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zM6 11c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm4 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zM9 5V3c0-.6-.4-1-1-1s-1 .4-1 1v2h2z"/>
      </svg>
    </div>
  );
}

export default StatusCell;
