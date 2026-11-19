// Distingue la cuenta del space activo: «me» / «me · …» = personal (rosa), el resto = trabajo (naranja).
import { View, div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, spaces, props } from "herdr";

const PERSONAL = "#f0a0c8", TRABAJO = "#ffb02e";

export default class MiCuenta extends View {
  render() {
    const t = theme();
    const nombre = spaces().find((s) => s.active)?.name ?? "";
    const personal = /^me(\s*·|$)/i.test(nombre);
    const col = personal ? PERSONAL : TRABAJO;
    if (props()?.franja) return div().size_full().bg(col);
    return h_flex().size_full().px(10).items_center().bg(t.chrome).border_t(1).border_color(t.border)
      .child(div().px(8).h(18).rounded(5).flex().items_center().bg(col + "26").text_size(10.5).font_bold().text_color(col).child(personal ? "PERSONAL" : "TRABAJO"));
  }
}
