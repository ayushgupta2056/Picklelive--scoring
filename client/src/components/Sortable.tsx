import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/** Drag-to-reorder list (mouse, touch and keyboard). */
export function SortableList<T>({ items, getId, onChange, render, className }: { items: T[]; getId: (t: T) => string; onChange: (items: T[]) => void; render: (t: T, i: number) => React.ReactNode; className?: string }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = items.map(getId);
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    onChange(arrayMove(items, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={cn("grid gap-2", className)}>
          {items.map((it, i) => <Row key={ids[i]} id={ids[i]}>{render(it, i)}</Row>)}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function Row({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex items-center gap-2 rounded-xl border bg-card p-2", isDragging && "z-10 shadow-xl ring-2 ring-lime")}>
      <button type="button" className="grid h-10 w-8 cursor-grab touch-none place-items-center text-muted-foreground" aria-label="Drag to reorder" {...attributes} {...listeners}><GripVertical className="h-5 w-5" /></button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
