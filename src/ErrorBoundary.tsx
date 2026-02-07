import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
    state: State = { hasError: false, error: null };

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    render() {
        const { hasError, error } = this.state;
        if (hasError) {
            return (
                <div className="p-8 bg-warm-charcoal text-red-400 font-mono h-screen">
                    <h1 className="text-xl mb-4 text-white">Application Crashed</h1>
                    <pre className="bg-black/30 p-4 rounded overflow-auto">
                        {error instanceof Error ? error.stack || error.message : String(error)}
                    </pre>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
