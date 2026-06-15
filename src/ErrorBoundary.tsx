import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** Evita la pagina bianca: se un componente crasha in render, mostra l'errore. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Errore di rendering:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="dropzone">
          <div className="dropzone-inner">
            <h1>SkyCoach</h1>
            <p className="error">Qualcosa è andato storto durante il rendering.</p>
            <pre
              style={{
                maxWidth: 520,
                whiteSpace: 'pre-wrap',
                color: '#f88',
                fontSize: 13,
              }}
            >
              {this.state.error.message}
            </pre>
            <button className="file-btn" onClick={() => location.reload()}>
              ricarica
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
