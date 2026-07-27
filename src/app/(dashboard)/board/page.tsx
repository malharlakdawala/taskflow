"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { TaskCard } from "@/components/tasks/task-card";
import { notify } from "@/lib/notify";
import type { Task, TaskStatus } from "@/lib/types";
import { STATUS_CONFIG } from "@/lib/types";

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
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-2xl font-bold">Board</h1>
          <p className="text-muted-foreground">
            Drag tasks between columns to update status
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </div>

      <div className="flex-1 overflow-x-auto p-6">
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 h-full min-w-max">
            {columns.map((column) => {
              const columnTasks = tasksByColumn[column];
              const config = STATUS_CONFIG[column];

              return (
                <div key={column} className="w-80 flex-shrink-0">
                  <Card className="h-full bg-muted/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-3 w-3 rounded-full ${config.color}`}
                        />
                        <CardTitle className="text-sm font-medium">
                          {config.label}
                        </CardTitle>
                        <Badge variant="secondary" className="ml-1">
                          {columnTasks.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Droppable droppableId={column}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`space-y-2 min-h-[200px] rounded-lg p-2 transition-colors ${
                              snapshot.isDraggingOver ? "bg-accent" : ""
                            }`}
                          >
                            {isLoading ? (
                              <div className="space-y-2">
                                <Skeleton className="h-24 w-full" />
                                <Skeleton className="h-24 w-full" />
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
                              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                                No tasks
                              </p>
                            )}
                          </div>
                        )}
                      </Droppable>
                    </CardContent>
                  </Card>
                </div>
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
