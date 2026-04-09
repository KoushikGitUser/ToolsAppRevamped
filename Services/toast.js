class SimpleEmitter {
  constructor() {
    this.handlers = {};
  }

  on(event, fn) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(fn);
    return () => this.off(event, fn);
  }

  off(event, fn) {
    if (!this.handlers[event]) return;
    this.handlers[event] = this.handlers[event].filter((h) => h !== fn);
  }

  emit(event, data) {
    if (!this.handlers[event]) return;
    [...this.handlers[event]].forEach((fn) => fn(data));
  }
}

export const toastEmitter = new SimpleEmitter();

// NORMAL TOAST
export const triggerToast = (title, description, type, duration) => {
  toastEmitter.emit("SHOW_TOAST", { title, description, type, duration });
};

// TOAST WITH ACTION
export const triggerToastWithAction = (
  title,
  description,
  type,
  duration,
  actionTitle,
  action
) => {
  toastEmitter.emit("SHOW_TOAST_WITH_ACTION", {
    title,
    description,
    type,
    duration,
    actionTitle,
    action,
  });
};
