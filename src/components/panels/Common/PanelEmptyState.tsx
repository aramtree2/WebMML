type PanelEmptyStateProps = {
    id: string;
};

export function PanelEmptyState({ id }: PanelEmptyStateProps) {
    return (
        <div className="panel-content">
            {id}
        </div>
    );
}
