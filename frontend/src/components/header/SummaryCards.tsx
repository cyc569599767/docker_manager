export type SummaryCardItem = {
  label: string;
  value: string | number;
};

export function SummaryCards(props: { cards: SummaryCardItem[] }) {
  return (
    <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {props.cards.map((card) => (
        <div key={card.label} className="rounded border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">{card.label}</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{card.value}</div>
        </div>
      ))}
    </section>
  );
}
