# Harness Check：預期失敗的 fixture 測試

這兩個測試**故意**斷言正確行為（substring 搜尋、跨模組參數一致），對照目前 fixture 裡刻意留下的 bug（`startsWith` 而非 substring；client 傳 `{ q }` 而 api 期待 `{ query }`）。它們是 Q3/Q5（`search`）與 Q4（`integration`）的評測材料，不屬於 repo 的綠燈測試，因此不放進 `node --test evals/quality/record.test.mjs hooks/*.test.mjs` 的日常清單，也不能用無範圍的 `node --test` 整批執行（會被誤判為 CI 失敗）。

執行環境：`node --version` → `v22.16.0`；分支 `codex/development-execution-plan`。

## `evals/quality/fixtures/search/tests/search.test.mjs`

指令：`node --test evals/quality/fixtures/search/tests/search.test.mjs`

退出碼：`1`（預期）

```text
TAP version 13
# Subtest: substring acceptance
not ok 1 - substring acceptance
  ---
  duration_ms: 2.8837
  type: 'test'
  location: 'C:\\Users\\Patrick\\Desktop\\agent_tool_for_sdlc\\AI-agent-development-platform\\evals\\quality\\fixtures\\search\\tests\\search.test.mjs:5:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
    + []
    - [
    -   'Alpha Beta'
    - ]
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'Alpha Beta'
  actual:
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///C:/Users/Patrick/Desktop/agent_tool_for_sdlc/AI-agent-development-platform/evals/quality/fixtures/search/tests/search.test.mjs:6:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 108.0446
```

解讀：`searchNames` 用 `normalizeName(name).startsWith(normalizeName(query))`，查詢 `'beta'` 對 `'Alpha Beta'`（正規化後 `'alpha beta'`）不是開頭比對，因此回傳 `[]`，未達測試斷言的 substring 結果 `['Alpha Beta']`。這正是 Q3／Q5 要讓 Reviewer 抓到的落差。

## `evals/quality/fixtures/integration/tests/flow.test.mjs`

指令：`node --test evals/quality/fixtures/integration/tests/flow.test.mjs`

退出碼：`1`（預期）

```text
TAP version 13
# Subtest: end-to-end search from the client returns matching names
not ok 1 - end-to-end search from the client returns matching names
  ---
  duration_ms: 2.6925
  type: 'test'
  location: 'C:\\Users\\Patrick\\Desktop\\agent_tool_for_sdlc\\AI-agent-development-platform\\evals\\quality\\fixtures\\integration\\tests\\flow.test.mjs:5:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly deep-equal:
    + actual - expected
    
      [
        'Alpha Beta',
    +   'Charlie Delta'
      ]
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected:
    0: 'Alpha Beta'
  actual:
    0: 'Alpha Beta'
    1: 'Charlie Delta'
  operator: 'deepStrictEqual'
  stack: |-
    TestContext.<anonymous> (file:///C:/Users/Patrick/Desktop/agent_tool_for_sdlc/AI-agent-development-platform/evals/quality/fixtures/integration/tests/flow.test.mjs:6:10)
    Test.runInAsyncScope (node:async_hooks:214:14)
    Test.run (node:internal/test_runner/test:1047:25)
    Test.start (node:internal/test_runner/test:944:17)
    startSubtestAfterBootstrap (node:internal/test_runner/harness:296:17)
  ...
1..1
# tests 1
# suites 0
# pass 0
# fail 1
# cancelled 0
# skipped 0
# todo 0
# duration_ms 106.0877
```

解讀：`client.search('beta')` 呼叫 `searchApi({ q: 'beta' })`，但 `searchApi` 只認得 `query` 欄位；收到 `query === undefined` 時視為「無查詢」並回傳全部名字，因此 `'Charlie Delta'` 也被包含進來，與測試斷言的 `['Alpha Beta']` 不符。個別的 `api.test.mjs`／`client.test.mjs`（見同目錄）各自獨立執行皆為 `pass`，證明「task 各自單測通過」不足以代表整合行為正確——這正是 Q4 要驗證的情境。

## 對照：同目錄的單元測試各自通過

指令：`node --test evals/quality/fixtures/integration/tests/api.test.mjs evals/quality/fixtures/integration/tests/client.test.mjs`

退出碼：`0`；輸出摘要：`# tests 2` `# pass 2` `# fail 0`（已於本次工作階段實際執行確認，不重複貼整份 TAP 輸出）。
