export async function toolCalendarCreate(payload: any) {

  return {
    reply: "Dodaję wydarzenie do kalendarza.",
    actions: [
      {
        type: "calendar_create",
        payload
      }
    ]
  };

}