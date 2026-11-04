// View module for /statechart: the Overview flow in the words of someone using it.
export const title = "Hyperbolic Workspaces: every step in the Overview on the primary monitor";

export const state = (v: any) => {
  const s = v.s;
  if (s.ov === "closed") return "Overview closed";
  if (s.search) return "Overview open, searching";
  const on = s.seat[s.focus];
  if (on === "-") return "Overview open, a blank tile focused";
  if (on === s.active) return "Overview open, your workspace focused";
  return "Overview open, another workspace focused";
};

const words: Record<string, string> = {
  open: "you open the Overview",
  switchClosed: "you switch workspace with the Overview closed",
  arrow: "you press an arrow key",
  pageUp: "you press Page Up, Page Down, Home or End",
  pageDown: "you press Page Up, Page Down, Home or End",
  home: "you press Page Up, Page Down, Home or End",
  end: "you press Page Up, Page Down, Home or End",
  modkey: "you press a plane key with a modifier held",
  type: "you type",
  escape: "you press Escape",
  close: "you press Super or close the Overview another way",
  searchpick: "you pick a search result",
  clicktile: "you click a tile",
  clickwindow: "you click a window",
  dragwindow: "you drag a window",
  pan: "you drag to pan",
  rim: "you click the rim arrow",
  movews: "you drag a workspace with the move modifier",
};

export const step = (_action: string, _from: any, to: any) => words[to.last.act] ?? null;

export const group = (v: any) => (v.s.ov === "closed" ? "closed" : "open");
export const colors = { closed: "tan", open: "blue" };
