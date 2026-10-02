# GIT 分支專案

| 項目 | 連結 |
| ---- | ---- |
| 母專案 | <https://github.com/se-test-Joan/git-example> |
| 母專案的分支 | <https://github.com/se-test-Joan/git-example/tree/developGitBranch> |
| 別人 fork 的分支 | <https://github.com/JoanWeng/git-example-fork> |

## 要點一：母專案用 `git checkout -b` 開分支後 merge

在母專案的本地副本（clone 下來的資料夾）操作：

```bash
# 1. 先把母專案的最新內容抓下來
git clone https://github.com/se-test-Joan/git-example.git
cd git-example

# 2. 切到要修改的基礎分支，並同步遠端最新狀態
git checkout main
git pull origin main

# 3. 由目前分支切出新分支（不會影響 main 的內容）
git checkout -b developGitBranch

# 4. 在新分支上開發、提交
git add .
git commit -m "feat: 新增功能"
git push -u origin developGitBranch
```

合併回主分支：

```bash
# 切回目標分支
git checkout main
git pull origin main

# 把新分支 merge 進來
git merge developGitBranch

# 有衝突就解決後
# git add .
# git commit

git push origin main

# 合併完成後刪除本地分支（-d 只有合併完才刪得掉）
git branch -d developGitBranch
```

注意事項：

- `git checkout -b 新分支名` 會**從目前所在的分支**開一個新分支，所以開分支前務必先 `git checkout` 到正確的基礎分支。
- 新分支 push 上去後，就變成「一人一分支」，後續用 Pull Request 合併較安全。
- 若不想用指令合併，也可以到 GitHub 上對該分支按 **Create pull request**，確認無誤再 **Merge pull request**。

## 要點二：別人 fork 分支的 merge 要求

別人 fork 出去以後，**他的分支不在母專案裡**，所以不能直接 merge，必須走 Pull Request：

1. **先 fork**：對方在 GitHub 上按母專案的 **Fork**，會得到自己的副本（例如 <https://github.com/JoanWeng/git-example-fork>）。
2. **在 fork 的副本上開分支**：於自己的 fork 內 `git checkout -b` 建立分支並 push。
3. **設定上游來源**：本地檔案要連到自己的 fork：

   ```bash
   git remote -v
   # origin  指向自己的 fork
   git remote add upstream https://github.com/se-test-Joan/git-example.git
   git fetch upstream
   ```

4. **送出 Pull Request（本次作業實際做法：全程在 GitHub 網頁操作）**：
   在自己 fork 的 repo 頁面按 **Compare & pull request** → **Create pull request**。
   - base（合併到哪裡）：**母專案** `se-test-Joan/git-example` 的 `main`
   - compare（要合併誰）：**自己的 fork** `JoanWeng/git-example-fork` 的分支
   - 送出後由母專案管理者審核。
   - 誰可以 merge：**只有母專案（上游）的管理者可以按下 Merge**。
   - 對方只能送 PR、只能回覆討論，**沒有權限直接 push 或 merge 母專案**。
5. **母專案管理者審核後合併（本次作業實際做法：在 GitHub 網頁按合併鈕）**：

   進入該 Pull Request 頁面 → 確認 **This branch has no conflicts with the base branch**
   → 選擇 **Create a merge commit** → 按綠色 **Merge pull request** → 按 **Confirm merge**。
   合併完成後母專案的 `main` 就會自動更新，不需要在本地執行任何 merge 指令。
   本地只要 `git pull` 就能取得合併後的結果。

   ```bash
   # 合併後，在本地把母專案的最新內容拉下來即可
   cd git-example
   git checkout main
   git pull origin main
   ```

   > 若不使用網頁合併，才需要改用指令合併（把對方的分支併進來）：
   >
   > ```bash
   > # 在母專案 clone 內
   > git checkout main
   > git pull origin main
   > git fetch upstream
   > git merge upstream/<PR的分支名稱>
   > git push origin main
   > ```

6. **同步母專案的最新內容**（避免衝突）：

   ```bash
   git fetch upstream
   git rebase upstream/main        # 或 git merge upstream/main
   git push origin <自己的分支名稱>
   ```

合併要求整理：

| 項目 | 說明 |
| ---- | ---- |
| 誰能 merge | 母專案管理者（上游 repo 的擁有者），於 PR 頁面按 **Merge pull request** |
| 誰不能 merge | fork 者只能提 PR，不能直接改母專案 |
| PR 方向 | 自己的 fork 分支 → 母專案的 `main` 或 `developGitBranch` |
| 合併方式 | 本次作業為 **GitHub 網頁合併**（Pull Request → Create a merge commit → Confirm merge） |
| 合併前 | 建議先 `git fetch upstream` 同步最新程式碼，並先在自己分支測試 |
| 合併後 | 網頁合併後只需 `git pull origin main`；再刪除已合併的分支（本地 `git branch -d`、遠端 `git push origin --delete`） |
| 衝突 | 若顯示 **This branch has conflicts**，由提出 PR 的人自行解決後再更新 PR |
