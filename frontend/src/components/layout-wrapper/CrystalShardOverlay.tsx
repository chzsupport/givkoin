import { CrystalShard } from '@/components/CrystalShard';

const CRYSTAL_DEFAULT_Z_INDEX = 9999;

type CrystalShardOverlayProps = {
    position: { top: number; left: number } | null;
    shard: {
        shardId: string;
        shardIndex: number;
    } | null;
};

export function CrystalShardOverlay({ position, shard }: CrystalShardOverlayProps) {
    if (!position || !shard) return null;

    return (
        <div
            data-crystal-overlay="true"
            style={{
                position: 'absolute',
                top: position.top,
                left: position.left,
                zIndex: CRYSTAL_DEFAULT_Z_INDEX,
                pointerEvents: 'auto',
                transition: 'top 0.3s ease-out, left 0.3s ease-out',
            }}
        >
            <CrystalShard
                shardId={shard.shardId}
                shardIndex={shard.shardIndex}
            />
        </div>
    );
}
