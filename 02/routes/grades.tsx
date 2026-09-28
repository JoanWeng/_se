import { page } from "fresh";
import { Fragment } from "preact";
import { Flash } from "../components/Flash.tsx";
import { Layout } from "../components/Layout.tsx";
import {
  type CourseSummary,
  type GradeEntry,
  gradeFieldSchema,
  listCourseRoster,
  listGradeableCourses,
  listOwnTranscript,
  listStudentTranscript,
  type RosterRow,
  saveCourseGrades,
  type TranscriptRow,
} from "../lib/grades.ts";
import { formatZodError, formToRecord, intParam } from "../lib/http.ts";
import { listSemesters } from "../lib/semesters.ts";
import { getStudent } from "../lib/students.ts";
import type { WriteResult } from "../lib/result.ts";
import { can } from "../lib/roles.ts";
import { define } from "../utils.ts";
import { z } from "zod";

const courseIdSchema = z.coerce.number().int().positive("無效的課程 id");

interface GradesData {
  message: string | null;
  error: string | null;
  /** 老師／管理員正在編輯的成績簿；null 表示只看總覽 */
  courseId: number | null;
  roster: RosterRow[] | null;
  /** admin 用：某位學生的成績單（唯讀） */
  viewStudentId: number | null;
}

/** 表單欄位名 → studentId。score_<id> / comment_<id> 成對出現 */
const SCORE_PREFIX = "score_";
const COMMENT_PREFIX = "comment_";

/**
 * 表單解析：把 score_1 / comment_1 這種欄位收回成 entries。
 * 解析失敗只記下第一個訊息，整批不送出 —— 讓使用者改完再存一次，
 * 不做「部分成功」，因為成績簿是同一筆資料的兩面。
 */
function parseEntries(raw: Record<string, string>): {
  entries: GradeEntry[];
  error: string | null;
} {
  const studentIds = new Set<number>();
  for (const key of Object.keys(raw)) {
    if (!key.startsWith(SCORE_PREFIX)) continue;
    const id = Number(key.slice(SCORE_PREFIX.length));
    if (Number.isInteger(id) && id > 0) studentIds.add(id);
  }

  const entries: GradeEntry[] = [];
  for (const studentId of studentIds) {
    const parsed = gradeFieldSchema.safeParse({
      score: raw[`${SCORE_PREFIX}${studentId}`] ?? "",
      comment: raw[`${COMMENT_PREFIX}${studentId}`] ?? "",
    });
    if (!parsed.success) {
      return {
        entries: [],
        error: `第 ${studentId} 號學生的成績有問題：${
          formatZodError(parsed.error, { score: "分數", comment: "評語" })
        }`,
      };
    }
    entries.push({ studentId, fields: parsed.data });
  }
  return { entries, error: null };
}

export const handler = define.handlers({
  GET(ctx) {
    const params = new URL(ctx.req.url).searchParams;
    const courseId = intParam(params, "course", 0);
    const viewStudentId = intParam(params, "student", 0);
    return page<GradesData>({
      message: null,
      error: null,
      courseId: courseId > 0 ? courseId : null,
      roster: null,
      viewStudentId: viewStudentId > 0 ? viewStudentId : null,
    });
  },

  async POST(ctx) {
    const user = ctx.state.user;
    if (user === null) return new Response("尚未登入", { status: 401 });
    if (!can(user.role, "grades:write:own_course")) {
      return new Response("只有授課教師與行政人員可以登錄成績", {
        status: 403,
      });
    }

    const raw = formToRecord(await ctx.req.formData());
    const { entries, error } = parseEntries(raw);
    const courseId = courseIdSchema.safeParse(raw.courseId ?? "");

    let result: WriteResult = error === null
      ? { ok: false, error: "無效的課程 id" }
      : { ok: false, error };
    if (error === null && courseId.success) {
      result = saveCourseGrades(user, courseId.data, entries);
    }

    const keepCourse = result.ok && courseId.success ? courseId.data : null;
    return page<GradesData>(
      {
        message: result.ok ? result.message : null,
        error: result.ok ? null : result.error,
        courseId: keepCourse,
        roster: null,
        viewStudentId: null,
      },
      { status: result.ok ? 200 : 400 },
    );
  },
});

/** 平均分四捨五入到小數一位；null 代表還沒有人成績 */
function formatAverage(value: number | null): string {
  return value === null
    ? "—"
    : Number.isInteger(value)
    ? String(value)
    : value.toFixed(1);
}

function formatScore(value: number | null): string {
  if (value === null) return "未登錄";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 依學期把成績單分組，方便對照「哪一學期修了幾門」 */
function groupBySemester(rows: TranscriptRow[]): {
  semesterId: number;
  semesterName: string;
  isCurrent: boolean;
  rows: TranscriptRow[];
}[] {
  const groups = new Map<
    number,
    {
      semesterId: number;
      semesterName: string;
      isCurrent: boolean;
      rows: TranscriptRow[];
    }
  >();
  for (const row of rows) {
    const group = groups.get(row.semesterId);
    if (group === undefined) {
      groups.set(row.semesterId, {
        semesterId: row.semesterId,
        semesterName: row.semesterName,
        isCurrent: row.isCurrentSemester,
        rows: [row],
      });
    } else {
      group.rows.push(row);
    }
  }
  return [...groups.values()];
}

function TranscriptTable({ rows }: { rows: TranscriptRow[] }) {
  if (rows.length === 0) return <p class="muted">沒有成績紀錄。</p>;
  return (
    <table class="table">
      <thead>
        <tr>
          <th>學期</th>
          <th>課程</th>
          <th>教師</th>
          <th>班級</th>
          <th>分數</th>
          <th>評語</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.gradeId}>
            <td>
              {row.semesterName}
              {row.isCurrentSemester && (
                <span class="badge badge-ok">本學期</span>
              )}
            </td>
            <td>{row.courseName}</td>
            <td>{row.teacherName}</td>
            <td class="muted">{row.className}</td>
            <td class="score-cell">{formatScore(row.score)}</td>
            <td class="muted">{row.comment ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SummaryTable(
  { courses }: { courses: CourseSummary[] },
) {
  if (courses.length === 0) {
    return <p class="muted">沒有可以登錄成績的課程。</p>;
  }
  return (
    <table class="table">
      <thead>
        <tr>
          <th>課程</th>
          <th>教師</th>
          <th>班級</th>
          <th>學期</th>
          <th>名冊</th>
          <th>已登錄</th>
          <th>平均</th>
          <th class="col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        {courses.map((course) => (
          <tr key={course.courseId}>
            <td>
              {course.courseName}
              {course.isCurrentSemester && (
                <span class="badge badge-ok">本學期</span>
              )}
            </td>
            <td>{course.teacherName}</td>
            <td>{course.className}</td>
            <td class="muted">{course.semesterName}</td>
            <td>{course.rosterCount}</td>
            <td>
              {course.gradedCount}
              {course.rosterCount > 0 &&
                ` / ${course.rosterCount}`}
            </td>
            <td class="score-cell">{formatAverage(course.average)}</td>
            <td class="col-actions">
              <a class="btn btn-sm" href={`/grades?course=${course.courseId}`}>
                成績簿
              </a>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default define.page<typeof handler>(function Grades({ data, state }) {
  const user = state.user;
  if (user === null) return <Layout user={null} title="成績">未登入</Layout>;

  const writable = can(user.role, "grades:write:own_course");
  const semesters = listSemesters();
  const summaries = writable ? listGradeableCourses(user) : [];

  // 學生看自己的成績單；老師／管理員看課程總覽或指定學生的成績單
  const transcriptRows = user.role === "student" ? listOwnTranscript(user) : [];
  const grouped = groupBySemester(transcriptRows);

  // ?student=<id>：老師／管理員看某位學生的成績單
  const viewStudent = writable && data.viewStudentId !== null
    ? getStudent(user, data.viewStudentId)
    : null;
  const viewRows = viewStudent === null
    ? []
    : listStudentTranscript(user, viewStudent.id);

  const activeCourse = data.courseId === null
    ? null
    : summaries.find((course) => course.courseId === data.courseId) ??
      null;
  const roster = activeCourse === null
    ? null
    : listCourseRoster(user, activeCourse.courseId);

  return (
    <Layout user={user} title="成績">
      <Flash message={data.message} error={data.error} />

      {/* ------------------------------------------------------ 學生成績單 */}
      {user.role === "student" && (
        <section class="card">
          <h2 class="card-title">我的成績</h2>
          {transcriptRows.length === 0
            ? <p class="muted">目前沒有成績紀錄。</p>
            : grouped.map((group) => (
              <Fragment key={group.semesterId}>
                <h3 class="card-subtitle">
                  {group.semesterName}
                  {group.isCurrent && (
                    <span class="badge badge-ok">本學期</span>
                  )}
                  <span class="muted">（{group.rows.length} 門）</span>
                </h3>
                <TranscriptTable rows={group.rows} />
              </Fragment>
            ))}
        </section>
      )}

      {/* ------------------------------------------- 老師／管理員的總覽 */}
      {writable && (
        <section class="card">
          <h2 class="card-title">課程成績總覽</h2>
          <p class="muted">
            {user.role === "teacher"
              ? "只列出您授課的課程。"
              : "全校課程都在這裡；點「成績簿」可代為登錄。"}
          </p>
          <SummaryTable courses={summaries} />
        </section>
      )}

      {/* ------------------------------------------------------- 成績簿表單 */}
      {writable && roster !== null && activeCourse !== null && (
        <section class="card">
          <h2 class="card-title">
            成績簿：{activeCourse.courseName}（{activeCourse.semesterName}）
          </h2>
          <p class="muted">
            名冊來自「{activeCourse
              .className}」的學生，另外選修這門課的學生也會出現在名單中。
            分數留空＝未登錄；分數與評語都清空＝取消登錄這筆成績。
          </p>
          {roster.length === 0
            ? <p class="muted">這門課還沒有任何學生。</p>
            : (
              <form method="post" class="gradebook">
                <input
                  type="hidden"
                  name="courseId"
                  value={activeCourse.courseId}
                />
                <table class="table">
                  <thead>
                    <tr>
                      <th>學號</th>
                      <th>姓名</th>
                      <th class="col-score">分數</th>
                      <th>評語</th>
                      <th>來源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((row) => (
                      <tr
                        key={row.studentId}
                        class={row.isActive ? "" : "row-inactive"}
                      >
                        <td>{row.studentNo}</td>
                        <td>
                          {row.name}
                          {!row.isActive && (
                            <span class="badge badge-off">停讀</span>
                          )}
                        </td>
                        <td class="col-score">
                          <input
                            type="number"
                            name={`${SCORE_PREFIX}${row.studentId}`}
                            min="0"
                            max="100"
                            step="0.5"
                            inputMode="decimal"
                            value={row.score ?? ""}
                            aria-label={`${row.name} 的分數`}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            name={`${COMMENT_PREFIX}${row.studentId}`}
                            maxLength={200}
                            value={row.comment ?? ""}
                            placeholder="選填"
                            aria-label={`${row.name} 的評語`}
                          />
                        </td>
                        <td class="muted">
                          {row.isEnrolled ? "選修" : "班級"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div class="form-actions">
                  <a class="btn" href="/grades">返回總覽</a>
                  <button type="submit" class="btn btn-primary">
                    儲存成績
                  </button>
                </div>
              </form>
            )}
        </section>
      )}

      {/* ------------------------------------- 老師／管理員看單一學生成績 */}
      {writable && viewStudent !== null && (
        <section class="card">
          <h2 class="card-title">
            成績單：{viewStudent.studentNo} {viewStudent.name}
            {viewStudent.className !== null && (
              <span class="muted">（{viewStudent.className}）</span>
            )}
          </h2>
          <p class="muted">
            {user.role === "teacher"
              ? "只顯示您授課課程的成績。"
              : "全校課程的成績都在這裡。"}
          </p>
          <TranscriptTable rows={viewRows} />
          <div class="form-actions">
            <a class="btn" href="/students">返回學生列表</a>
          </div>
        </section>
      )}

      {/* ------------------------------------------------- 學期切換說明 */}
      {writable && semesters.length > 1 && (
        <section class="card">
          <h2 class="card-title">學期</h2>
          <p class="muted">
            成績永遠記在「開課時綁定的學期」，切換目前學期不會移動既有成績。
            目前學期：
            {semesters.find((s) => s.isCurrent)?.name ?? "尚未設定"}。
          </p>
        </section>
      )}
    </Layout>
  );
});
