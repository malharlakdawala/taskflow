"use client";

import { useEffect, useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import type { Task } from "@/lib/types";
import { STATUS_CONFIG, PRIORITY_CONFIG } from "@/lib/types";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from "date-fns";

export default function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

  useEffect(() => {
    let cancelled = false;

    const fetchTasks = async () => {
      try {
        const response = await fetch("/api/tasks");
        if (!response.ok) throw new Error("Failed to load tasks");
        const data = await response.json();
        if (!cancelled) setTasks(data);
      } catch (error) {
        console.error("Failed to fetch tasks:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchTasks();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTaskCreated = (task: Task) => {
    setTasks(prev => [...prev, task]);
  };

  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => {
      if (!task.dueDate) return false;
      return isSameDay(new Date(task.dueDate), date);
    });
  };

  const selectedDateTasks = getTasksForDate(selectedDate);

  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const tasksWithDueDate = tasks.filter(task => task.dueDate);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between p-6 border-b">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-muted-foreground">View tasks by due date</p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{format(currentMonth, "MMMM yyyy")}</CardTitle>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  className="rounded-md border"
                />
              </CardContent>
            </Card>
          </div>

          <div>
            <Card>
              <CardHeader>
                <CardTitle>
                  Tasks for {format(selectedDate, "MMM d, yyyy")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {selectedDateTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No tasks due on this date
                  </p>
                ) : (
                  <div className="space-y-2">
                    {selectedDateTasks.map(task => {
                      const statusConfig = STATUS_CONFIG[task.status];
                      const priorityConfig = PRIORITY_CONFIG[task.priority];
                      
                      return (
                        <Link
                          key={task.id}
                          href={`/tasks/${task.id}`}
                          className="block p-3 rounded-lg border hover:bg-muted transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-medium text-sm line-clamp-2">
                              {task.title}
                            </h3>
                            {task.priority !== "NONE" && (
                              <span className={`text-xs ${priorityConfig.color}`}>
                                {priorityConfig.label}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${statusConfig.color}`}>
                              {statusConfig.label}
                            </Badge>
                            {task.assignee && (
                              <span className="text-xs text-muted-foreground">
                                {task.assignee.name || task.assignee.email}
                              </span>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Upcoming Tasks</CardTitle>
              </CardHeader>
              <CardContent>
                {tasksWithDueDate.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No upcoming tasks
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tasksWithDueDate
                      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
                      .slice(0, 5)
                      .map(task => {
                        const statusConfig = STATUS_CONFIG[task.status];
                        
                        return (
                          <Link
                            key={task.id}
                            href={`/tasks/${task.id}`}
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                          >
                            <span className="text-sm font-medium line-clamp-1">
                              {task.title}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(task.dueDate!), "MMM d")}
                            </span>
                          </Link>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <CreateTaskDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onTaskCreated={handleTaskCreated}
      />
    </div>
  );
}
