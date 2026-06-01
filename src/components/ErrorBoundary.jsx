import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[REACT_ERROR_BOUNDARY]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="m-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          <h2 className="font-black">La app detectó un error</h2>
          <p className="mt-2 text-sm">{this.state.error?.message || "Error desconocido"}</p>
          <button className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white" onClick={() => window.location.reload()}>Recargar</button>
        </div>
      );
    }
    return this.props.children;
  }
}