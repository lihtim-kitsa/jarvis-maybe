import EventSource from "react-native-sse";

export class EventStream {
  constructor(publicUrl, onAlert) {
    this.publicUrl = publicUrl;
    this.onAlert = onAlert;
    this.es = null;
  }

  connect() {
    this.es = new EventSource(`${this.publicUrl}/api/alerts`);
    
    this.es.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message) {
          this.onAlert(data.message);
        }
      } catch (err) {
        console.error("SSE parse error", err);
      }
    });

    this.es.addEventListener("error", (err) => {
      console.error("SSE connection error", err);
    });
  }

  disconnect() {
    if (this.es) {
      this.es.close();
      this.es = null;
    }
  }
}
