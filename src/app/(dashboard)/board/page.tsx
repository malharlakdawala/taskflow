"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Inbox } from "lucide-react";
import { StatusDot } from "@/components/tasks/status-badge";
import { cn } from "@/lib/utils";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskCard } from "@/components/tasks/task-card";
import { notify } from "@/lib/notify";
import type { Task, TaskStatus } from "@/lib/types";
import { STATUS_ITEMS } from "@/lib/types";

const columns: TaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
];

/** Gap between adjacent `order` values, leaving room to insert between them. */
const ORDER_STEP = 1000;

export default function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchTasks = async () => {
      try {
        const response = await fetch("/api/tasks");
        if (!response.ok) throw new Error("Failed to load tasks");
        const data: Task[] = await response.json();
        if (!cancelled) setTasks(data);
      } catch (error) {
        console.error("Failed to fetch tasks:", error);
        if (!cancelled) notify.error("Could not load tasks. Please refresh.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTasks();
    return () => {
      cancelled = true;
    };
  }, []);

  const tasksByColumn = useMemo(() => {
    const grouped = Object.fromEntries(
      columns.map((column) => [column, [] as Task[]])
    ) as Record<TaskStatus, Task[]>;

    for (const task of tasks) {
      grouped[task.status]?.push(task);
    }
    for (const column of columns) {
      grouped[column].sort((a, b) => a.order - b.order);
    }
    return grouped;
  }, [tasks]);

  const persistOrder = useCallback(
    async (
      moved: Array<Pick<Task, "id" | "status" | "order">>,
      rollback: Task[]
    ) => {
      try {
        const response = await fetch("/api/tasks/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks: moved }),
        });
        if (!response.ok) throw new Error("Reorder failed");
      } catch (error) {
        console.error("Failed to persist task order:", error);
        setTasks(rollback);
        notify.error("Could not save the new order", "Your change was reverted.");
      }
    },
    []
  );

  const handleDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const previousTasks = tasks;
    const destinationStatus = destination.droppableId as TaskStatus;
    const moved = tasks.find((task) => task.id === draggableId);
    if (!moved) return;

    // Rebuild the destination column with the card in its new slot.
    const destinationTasks = tasksByColumn[destinationStatus].filter(
      (task) => task.id !== draggableId
    );
    destinationTasks.splice(destination.index, 0, {
      ...moved,
      status: destinationStatus,
    });

    // Renumber the whole column so the resulting order is unambiguous.
    const renumbered = destinationTasks.map((task, index) => ({
      ...task,
      status: destinationStatus,
      order: (index + 1) * ORDER_STEP,
    }));
    const renumberedById = new Map(renumbered.map((task) => [task.id, task]));

    // Optimistic update; persistOrder rolls this back if the write fails.
    setTasks((current) =>
      current.map((task) => renumberedById.get(task.id) ?? task)
    );

    void persistOrder(
      renumbered.map(({ id, status, order }) => ({ id, status, order })),
      previousTasks
    );
  };

  const handleTaskCreated = (task: Task) => {
    setTasks((prev) => [...prev, task]);
  };

  const handleTaskDeleted = (taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center justify-between border-b bg-card/60 px-6 py-4 backdrop-blur">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Board</h1>
          <p className="text-sm text-muted-foreground">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"} · drag a card
            to change its status
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New task
        </Button>
      </header>

      <div className="flex-1 overflow-x-auto p-6">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex h-full min-w-max items-stretch gap-4">
            {columns.map((column) => {
              const columnTasks = tasksByColumn[column];

              return (
                <section
                  key={column}
                  data-status={column}
                  className="flex max-h-full w-[19rem] shrink-0 flex-col rounded-xl border bg-muted/40"
                >
                  {/* Header wears the column's colour, so the board reads as a
                      sequence of states rather than five identical boxes. */}
                  <div className="flex items-center gap-2 border-b border-[var(--tone)]/25 px-3 py-2.5">
                    <StatusDot status={column} />
                    <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--tone-ink)]">
                      {STATUS_ITEMS[column]}
                    </h2>
                    <span className="tone-chip ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums">
                      {columnTasks.length}
                    </span>
                  </div>

                  <Droppable droppableId={column}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "flex-1 space-y-2 overflow-y-auto rounded-b-xl p-2 transition-colors duration-150",
                          snapshot.isDraggingOver &&
                            "bg-[var(--tone-soft)] ring-1 ring-inset ring-[var(--tone)]/30"
                        )}
                      >
                        {isLoading ? (
                          <div className="space-y-2">
                            <Skeleton className="h-24 w-full rounded-xl" />
                            <Skeleton className="h-24 w-full rounded-xl" />
                          </div>
                        ) : (
                          columnTasks.map((task, index) => (
                            <Draggable
                              key={task.id}
                              draggableId={task.id}
                              index={index}
                            >
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                >
                                  <TaskCard
                                    task={task}
                                    isDragging={dragSnapshot.isDragging}
                                    onDelete={handleTaskDeleted}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))
                        )}
                        {provided.placeholder}
                        {!isLoading && columnTasks.length === 0 && (
                          <div className="flex flex-col items-center gap-1.5 px-2 py-8 text-center">
                            <Inbox className="h-5 w-5 text-muted-foreground/50" />
                            <p className="text-xs text-muted-foreground">
                              Nothing here yet
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                </section>
              );
            })}
          </div>
        </DragDropContext>
      </div>

      <CreateTaskDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onTaskCreated={handleTaskCreated}
      />
    </div>
  );
}
