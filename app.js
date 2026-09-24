const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const USERS_KEY = "studybuddy_users_v2";
const SESSION_KEY = "studybuddy_session_v2";

let currentUser = null;
let quizState = null;

function getUsers(){ return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
function saveUsers(users){ localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function initials(name){ return (name||"U").split(/\s+/).map(x=>x[0]).join("").slice(0,2).toUpperCase(); }
function key(s){ return `studybuddy_${s}_${currentUser.id}`; }
function getData(s, fallback=[]){ return JSON.parse(localStorage.getItem(key(s)) || JSON.stringify(fallback)); }
function setData(s,v){ localStorage.setItem(key(s), JSON.stringify(v)); }
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); setTimeout(()=>t.classList.remove("show"),2200); }

async function hashPassword(password){
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}

function showAuth(mode="login"){
  $$(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.auth===mode));
  $("#loginForm").classList.toggle("hidden",mode!=="login");
  $("#signupForm").classList.toggle("hidden",mode!=="signup");
}

async function signup(e){
  e.preventDefault();
  const users=getUsers(), email=$("#signupEmail").value.trim().toLowerCase();
  if(users.some(u=>u.email===email)) return toast("Email already registered.");
  const user={
    id:uid(), name:$("#signupName").value.trim(), email,
    passwordHash:await hashPassword($("#signupPassword").value),
    course:$("#signupCourse").value.trim(), college:$("#signupCollege").value.trim(),
    subjects:$("#signupSubjects").value.split(",").map(s=>s.trim()).filter(Boolean),
    goal:$("#signupGoal").value.trim(), hours:Number($("#signupHours").value)||3,
    createdAt:new Date().toISOString()
  };
  users.push(user); saveUsers(users); currentUser=user; localStorage.setItem(SESSION_KEY,user.id);
  startApp(); toast("Account created successfully!");
}

async function login(e){
  e.preventDefault();
  const email=$("#loginEmail").value.trim().toLowerCase(), pass=await hashPassword($("#loginPassword").value);
  const user=getUsers().find(u=>u.email===email && u.passwordHash===pass);
  if(!user) return toast("Invalid email or password.");
  currentUser=user; localStorage.setItem(SESSION_KEY,user.id); startApp(); toast("Welcome back!");
}

function startApp(){
  $("#authScreen").classList.add("hidden"); $("#app").classList.remove("hidden");
  updateUserUI(); renderAll(); navigate("home");
  $("#darkMode").checked=localStorage.getItem("studybuddy_dark")==="1";
  document.body.classList.toggle("dark",$("#darkMode").checked);
}
function updateUserUI(){
  $("#sideName").textContent=currentUser.name; $("#sideCourse").textContent=currentUser.course;
  $("#avatar").textContent=initials(currentUser.name); $("#heroName").textContent=currentUser.name.split(" ")[0];
  $("#heroGoal").textContent=currentUser.goal || "Let's make today's study session productive.";
  $("#profileAvatar").textContent=initials(currentUser.name); $("#profileDisplayName").textContent=currentUser.name;
  $("#profileEmail").textContent=currentUser.email;
  $("#profileName").value=currentUser.name; $("#profileEmailInput").value=currentUser.email;
  $("#profileCourse").value=currentUser.course; $("#profileCollege").value=currentUser.college||"";
  $("#profileSubjects").value=(currentUser.subjects||[]).join(", "); $("#profileHours").value=currentUser.hours||3;
  $("#profileGoal").value=currentUser.goal||"";
}
function navigate(page){
  $$(".page").forEach(p=>p.classList.add("hidden")); $(`#page-${page}`).classList.remove("hidden");
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const titles={home:"Welcome back!",planner:"Study Planner",topics:"Topics",quiz:"AI Quiz Generator",profile:"My Profile",settings:"Settings"};
  $("#pageTitle").textContent=titles[page]||"StudyBuddy";
  $(".sidebar").classList.remove("open");
}
function renderAll(){ renderHome(); renderPlanner(); renderTopics(); renderProfile(); }

function renderHome(){
  const tasks=getData("tasks"), done=tasks.filter(t=>t.done).length, history=getData("quizHistory");
  $("#statTasks").textContent=tasks.length; $("#statDone").textContent=done; $("#statQuizzes").textContent=history.length;
  const avg=history.length?Math.round(history.reduce((a,x)=>a+x.score,0)/history.length):0; $("#statScore").textContent=avg+"%";
  const today=new Date().toISOString().slice(0,10);
  const todayTasks=tasks.filter(t=>t.date===today).slice(0,5);
  $("#homeTasks").innerHTML=todayTasks.length?todayTasks.map(taskHTML).join(""):`<div class="empty">No tasks for today.<br><button class="text-btn" data-go="planner">Add a study task</button></div>`;
  const last=history[0]; $("#recentQuiz").innerHTML=last?`<div class="score-box"><small>${escapeHtml(last.topic)} • ${last.difficulty}</small><strong>${last.score}%</strong><span>${last.correct}/${last.total} correct</span></div>`:`<div class="empty">No quiz attempts yet.<br><button class="text-btn" data-go="quiz">Generate your first AI quiz</button></div>`;
  bindDynamic();
}
function taskHTML(t){return `<div class="task ${t.done?"done":""}" data-id="${t.id}"><button class="check" data-check="${t.id}">${t.done?"✓":""}</button><div class="task-info"><div class="task-title">${escapeHtml(t.title)}</div><div class="task-meta">${escapeHtml(t.subject||"General")} • ${t.date} • ${t.priority}</div></div><button class="delete" data-delete="${t.id}">×</button></div>`}
function renderPlanner(){
  const tasks=getData("tasks").sort((a,b)=>a.date.localeCompare(b.date));
  $("#plannerList").innerHTML=tasks.length?tasks.map(taskHTML).join(""):`<div class="empty">No tasks yet. Add your first study task above.</div>`;
  bindDynamic();
}
function renderTopics(){
  const subjects=currentUser.subjects||[];
  const progress=getData("topics",{}); 
  $("#topicsGrid").innerHTML=subjects.length?subjects.map(s=>{
    const p=Number(progress[s]||0); return `<div class="topic-card"><h3>${escapeHtml(s)}</h3><small>${p}% completed</small><div class="progress"><i style="width:${p}%"></i></div><button class="text-btn" data-topic="${encodeURIComponent(s)}">+ 10% progress</button></div>`;
  }).join(""):`<div class="empty">Add subjects from your Profile to see them here.</div>`;
}
function renderProfile(){ updateUserUI(); }

function bindDynamic(){
  $$("[data-go]").forEach(b=>b.onclick=()=>navigate(b.dataset.go));
  $$("[data-check]").forEach(b=>b.onclick=()=>{const tasks=getData("tasks"); const t=tasks.find(x=>x.id===b.dataset.check); if(t)t.done=!t.done; setData("tasks",tasks);renderAll();});
  $$("[data-delete]").forEach(b=>b.onclick=()=>{setData("tasks",getData("tasks").filter(x=>x.id!==b.dataset.delete));renderAll();});
  $$("[data-topic]").forEach(b=>b.onclick=()=>{const name=decodeURIComponent(b.dataset.topic), p=getData("topics",{});p[name]=Math.min(100,Number(p[name]||0)+10);setData("topics",p);renderTopics();});
}

$("#taskForm").onsubmit=e=>{
  e.preventDefault();
  const tasks=getData("tasks"); tasks.push({id:uid(),title:$("#taskTitle").value.trim(),subject:$("#taskSubject").value.trim(),date:$("#taskDate").value,priority:$("#taskPriority").value,done:false});
  setData("tasks",tasks); e.target.reset(); $("#taskDate").value=new Date().toISOString().slice(0,10); renderAll(); toast("Task added.");
};

$("#profileForm").onsubmit=e=>{
  e.preventDefault();
  const users=getUsers(), i=users.findIndex(u=>u.id===currentUser.id);
  const email=$("#profileEmailInput").value.trim().toLowerCase();
  if(users.some(u=>u.email===email && u.id!==currentUser.id)) return toast("That email is already in use.");
  currentUser={...currentUser,name:$("#profileName").value.trim(),email,course:$("#profileCourse").value.trim(),college:$("#profileCollege").value.trim(),subjects:$("#profileSubjects").value.split(",").map(s=>s.trim()).filter(Boolean),hours:Number($("#profileHours").value)||3,goal:$("#profileGoal").value.trim()};
  users[i]=currentUser;saveUsers(users);renderAll();toast("Profile saved.");
};

async function generateQuiz(){
  const topic=$("#quizTopic").value.trim();
  if(!topic)return toast("Enter a quiz topic first.");
  const difficulty=$("#quizDifficulty").value, count=Number($("#quizCount").value);
  $("#generateQuiz").disabled=true;$("#aiStatus").textContent="Generating...";
  try{
    const res=await fetch("/api/generate-quiz",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic,difficulty,count,course:currentUser.course,subjects:currentUser.subjects,goal:currentUser.goal})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || "Backend/API error");
    quizState={...data,topic,difficulty}; renderQuiz();
    $("#aiStatus").textContent=data.source==="ai"?"Gemini AI generated":"Demo AI mode";
  }catch(err){
    console.error(err);
    quizState={questions:localQuiz(topic,difficulty,count),topic,difficulty,source:"demo"};renderQuiz();
    $("#aiStatus").textContent=err.message || "Backend/API not available";
  }finally{$("#generateQuiz").disabled=false;}
}
function localQuiz(topic,difficulty,count){
  const base=[
    {question:`Which statement best describes the main idea of ${topic}?`,options:["A core concept used to understand the topic","A type of computer hardware","A file format","A programming language"],answer:0,explanation:"The first option represents the general concept; use your course material to connect it to the specific topic."},
    {question:`When studying ${topic}, what is a useful first step?`,options:["Understand definitions and fundamentals","Skip directly to the hardest problem","Memorize random answers","Avoid examples"],answer:0,explanation:"Understanding fundamentals makes later problems easier."},
    {question:`Which approach usually improves understanding of ${topic}?`,options:["Practice with examples","Only reading once","Ignoring mistakes","Skipping revision"],answer:0,explanation:"Active practice and reviewing mistakes help reinforce learning."},
    {question:`What should you do when an answer about ${topic} is incorrect?`,options:["Review why it was wrong","Delete your notes","Stop studying","Guess again without checking"],answer:0,explanation:"Reviewing mistakes helps identify gaps in understanding."},
    {question:`Which is a good revision strategy for ${topic}?`,options:["Spaced practice and self-testing","One long session only","Never revisiting the topic","Copying answers"],answer:0,explanation:"Spaced practice and self-testing are useful study techniques."}
  ];
  return Array.from({length:count},(_,i)=>({...base[i%base.length],question:`${base[i%base.length].question} (${difficulty})`}));
}
function renderQuiz(){
  const area=$("#quizArea");area.classList.remove("hidden");
  area.innerHTML=quizState.questions.map((q,i)=>`<div class="quiz-question" data-q="${i}"><div class="q-number">QUESTION ${i+1}</div><h3>${escapeHtml(q.question)}</h3><div class="options">${q.options.map((o,j)=>`<button class="option" data-option="${i}-${j}">${escapeHtml(o)}</button>`).join("")}</div><div class="explanation hidden" id="exp-${i}">${escapeHtml(q.explanation||"")}</div></div>`).join("")+`<div class="quiz-actions"><span class="muted">Answer every question.</span><button id="submitQuiz" class="primary">Submit Quiz</button></div>`;
  $$(".option").forEach(btn=>btn.onclick=()=>{
    const [qi,oi]=btn.dataset.option.split("-").map(Number);
    $$(`[data-q="${qi}"] .option`).forEach(x=>x.classList.remove("selected"));btn.classList.add("selected");
  });
  $("#submitQuiz").onclick=submitQuiz;
}
function submitQuiz(){
  let correct=0,answered=0;
  quizState.questions.forEach((q,i)=>{
    const selected=document.querySelector(`[data-q="${i}"] .option.selected`);
    if(selected){answered++;const oi=Number(selected.dataset.option.split("-")[1]);if(oi===Number(q.answer))correct++;}
    $$(`[data-q="${i}"] .option`).forEach((b,j)=>{if(j===Number(q.answer))b.classList.add("correct");else if(b.classList.contains("selected"))b.classList.add("wrong");b.disabled=true;});
    $(`#exp-${i}`).classList.remove("hidden");
  });
  const score=Math.round(correct/quizState.questions.length*100);
  const history=getData("quizHistory");history.unshift({id:uid(),topic:quizState.topic,difficulty:quizState.difficulty,score,correct,total:quizState.questions.length,date:new Date().toISOString()});setData("quizHistory",history.slice(0,30));
  document.querySelector(".quiz-actions").innerHTML=`<div><strong>${correct}/${quizState.questions.length}</strong> answered correctly • ${answered} attempted</div><button class="primary" id="newQuiz">Generate Another</button>`;
  $("#newQuiz").onclick=()=>{$("#quizArea").classList.add("hidden");window.scrollTo({top:0,behavior:"smooth"});};
  renderHome();toast(`Quiz completed: ${score}%`);
}

$("#generateQuiz").onclick=generateQuiz;
$("#logoutBtn").onclick=()=>{localStorage.removeItem(SESSION_KEY);location.reload();};
$("#darkMode").onchange=e=>{document.body.classList.toggle("dark",e.target.checked);localStorage.setItem("studybuddy_dark",e.target.checked?"1":"0");};
$("#resetData").onclick=()=>{if(confirm("Reset tasks, topics and quiz history for this account?")){["tasks","topics","quizHistory"].forEach(x=>localStorage.removeItem(key(x)));renderAll();toast("Study data reset.");}};
$("#mobileMenu").onclick=()=>$(".sidebar").classList.toggle("open");
$$(".auth-tab").forEach(b=>b.onclick=()=>showAuth(b.dataset.auth));
$("#loginForm").onsubmit=login;$("#signupForm").onsubmit=signup;
$$(".nav-item").forEach(b=>b.onclick=()=>navigate(b.dataset.page));

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

(function init(){
  $("#taskDate").value=new Date().toISOString().slice(0,10);
  const id=localStorage.getItem(SESSION_KEY), user=getUsers().find(u=>u.id===id);
  if(user){currentUser=user;startApp();} else showAuth("login");
})();
