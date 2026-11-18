import editorWorker from 'monaco-editor/editor/common/services/editorWebWorkerMain.js?worker';
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

/**
 * 注册 Monaco 的 Web Worker 运行环境。
 *
 * 不注册时，Monaco 会把基础 worker（editorWorkerService）内联成一段 data: URL，
 * 而该 URL 内部的相对 import 无法解析，worker 启动失败后会被 Monaco 重新抛出，
 * 最终触发全局错误提示（"发生未知运行时错误"）。开发模式下走 Vite 的模块路径所以
 * 不复现，只有打包后的产物才会出现。
 *
 * 这里统一交给 Vite 打包 worker 产物，并按 label 分发到对应语言的 worker。
 */
const scope = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: (moduleId: string, label: string) => Worker;
  };
};

scope.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string): Worker {
    switch (label) {
      case 'json':
        return new jsonWorker();
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker();
      case 'html':
      case 'handlebars':
      case 'razor':
        return new htmlWorker();
      case 'typescript':
      case 'javascript':
        return new tsWorker();
      default:
        // 基础 worker：链接解析、词级补全等通用能力
        return new editorWorker();
    }
  },
};
