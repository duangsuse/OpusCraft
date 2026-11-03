// 当前帧对象 F 的句柄：pass 模板里写 `${() => F.sunDir}`（名字取末尾的 sunDir），render() 每帧开头 setFrame(F)
let cur = null;
export const setFrame = f => { cur = f; };
export const F = new Proxy({}, { get: (_, k) => cur[k] });
