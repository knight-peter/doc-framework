'use strict';
/** check 阶段 2：应用清单与规范完整性。
 *  模块约定：ctx 只读（root/docRoot/docLabel/strict/readText/listDir/unreadable/registry 按需）；返回 { issues, notes } 由 commands/check.js 按阶段顺序汇总（不共享可变数组）。 */
const fs = require('fs');
const path = require('path');
const plan = require('../lib/plan');

/** 阶段 2：规范完整性——按档案「应用清单」逐应用校验；缺清单即硬报错（清单是必需节）。
 *  @returns 应用清单（供阶段 3 归属校验），无清单为 null */
function stageRegistry(ctx) {
  const { docRoot, docLabel, root, unreadable } = ctx;
  const issues = [];
  const notes = [];
  // 2. 规范完整性：按档案「应用清单」逐应用校验；缺清单 → 硬报错
  //    ⚠️ 档案**存在但读不出**时不当成"缺清单"报——那是另一个问题（unreadable 单独报）
  const profilePath = plan.findProfilePath(docRoot);
  if (profilePath) {
    try { fs.accessSync(profilePath, fs.constants.R_OK); }
    catch (e) { unreadable.push(`${path.relative(root, profilePath)}（${e.code || e.message}）`); }
  }
  const registry = fs.existsSync(docRoot) ? plan.parseAppRegistry(docRoot) : null;
  if (registry) {
  // 类型层规范：按应用类型要求（应用类型关键词只认中文词表）
    const needTypeFront = registry.some(a => plan.appTypeMatches(a.type, 'front'));
    const needTypeBack = registry.some(a => plan.appTypeMatches(a.type, 'back'));
    if (needTypeFront && !fs.existsSync(path.join(docRoot, plan.NAMES.zh.typeFrontend))) {
      issues.push(`❌ 缺少规范文档：${docLabel}/${plan.NAMES.zh.typeFrontend}（存在前端应用，应从官方模板渲染）`);
    }
    if (needTypeBack && !fs.existsSync(path.join(docRoot, plan.NAMES.zh.typeBackend))) {
      issues.push(`❌ 缺少规范文档：${docLabel}/${plan.NAMES.zh.typeBackend}（存在服务端应用，应从官方模板渲染）`);
    }
    for (const app of registry) {
      if (app.spec && !fs.existsSync(path.join(docRoot, app.spec))) {
        issues.push(`❌ 应用「${app.id}」缺少规范文件：${docLabel}/${app.spec}`);
      }
      if (app.root !== '.' && !fs.existsSync(path.join(root, app.root))) {
        issues.push(`❌ 应用「${app.id}」代码根不存在：${app.root}（按现状登记任意路径，但必须是会话内可见路径）`);
      }
      for (const other of registry) {
        if (other !== app && other.root !== '.' && app.root !== '.'
          && app.root.startsWith(other.root + '/')) {
          issues.push(`❌ 应用代码根互相嵌套：「${app.id}」${app.root} 在「${other.id}」${other.root} 之内（最长前缀优先解析，建议拆平）`);
        }
      }
    }
  } else if (!unreadable.length) {
  // 应用清单是必需节（skill 的路由表）
    issues.push(`❌ 档案缺「应用清单」节：${docLabel}/${plan.NAMES.zh.profile}`
      + `（它是 skill 的路由表，必须从官方模板渲染，见《接入指南》「模板来源」）`);
  }

  return { registry, issues, notes };
}

module.exports = { stageRegistry };
