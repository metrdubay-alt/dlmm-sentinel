import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Не удалось отобразить экран</h1>
        <p>Локальные данные сохранены. Перезапустите приложение.</p>
        <button onClick={() => location.reload()}>Повторить</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
