/**
 * What the AI interviewer says around each question, so the spoken voice sounds like a person
 * running a real interview: a greeting, the round explained, transitions, follow-ups and a close.
 */
const ROUND_INTRO = {
  screening: "This is the screening round. I'd like to understand your background, your motivation and whether this role is a good fit.",
  technical: "This is the technical round. I'll ask about the core skills for the role. Think out loud and explain your reasoning, not just the answer.",
  behavioural: "This is the behavioural round. I'll ask about real situations from your past. A good structure is situation, task, action and result.",
  technical_sales: "This is the sales skills round. I'll play your customer in a few role-plays, and ask how you plan and run your sales. Answer as if we're really on the call.",
  technical_finance: "This is the finance technical round. Some questions are cases and calculations, so walk me through your numbers step by step, then the concepts behind them.",
  technical_hr: "This is the functional HR round. I'll give you real workplace scenarios and ask about HR practice and law. Tell me exactly what you would do, and why.",
  hr: "This is the HR round. We'll talk about expectations, culture fit and how you work with people.",
  practice: "This is a practice session, so relax. I'll give you feedback after every answer.",
}

const ACK = ['Mm-hm. Thank you.', 'Right, that makes sense.', 'Okay, thanks for walking me through that.', 'Got it. I appreciate the detail.', 'Alright, thank you.', 'Okay. Good to know.']
const ACK_SHORT = ['Okay.', 'Alright, short and to the point.', 'Okay, noted.']
const NEXT = ['Next question.', "Let's move on.", 'Here is the next one.', "Let's go to the next question."]
const FOLLOW = ["Interesting. Let me dig into that a little more.", "Okay. I'd like to follow up on that.", 'Thanks. Can you go a bit deeper on this?']
const pick = (list, n) => list[Math.abs(n) % list.length]

/** A short acknowledgement of the last answer, said before a pause. Never hints at the score. */
export function acknowledge(lastAnswer, n) {
  if (!lastAnswer) return ''
  const words = lastAnswer.trim().split(/\s+/).length
  return words < 25 ? pick(ACK_SHORT, n) : pick(ACK, n + words)
}

export function preface({ st, name, first }) {
  const n = st.question_number || 1
  const coding = {
    coding: ' This one is a coding question, so please write your solution in the editor below.',
    roleplay: " This one is a role-play. I'm the customer now, so speak to me as you would on a real call.",
    case: ' This one is a case. Please show your working, step by step.',
    scenario: ' This one is a workplace scenario. Tell me what you would actually do, in order.',
  }[st.kind] || ''
  if (st.is_followup) return pick(FOLLOW, n)
  if (n === 1 && first) {
    const hello = `Hello${name ? ` ${name}` : ''}, thanks for joining. I'll be your interviewer today.`
    const round = st.mode === 'practice' ? ROUND_INTRO.practice : (ROUND_INTRO[`${st.round_type}_${st.field}`] || ROUND_INTRO[st.round_type] || '')
    return `${hello} ${round} We have ${st.total} questions. Take a moment before each answer if you need it. Let's begin. First question.${coding}`
  }
  if (first) return `Welcome back. Let's continue where we left off. Question ${n}.${coding}`
  if (n === st.total) return `This is the last question of this round.${coding}`
  return `${pick(NEXT, n)} Question ${n}.${coding}`
}

export function closing({ round, status, name }) {
  const thanks = `That's the end of this round. Thank you for your time${name ? `, ${name}` : ''}.`
  if (!round) return thanks
  if (status === 'completed') return `${thanks} Congratulations, you have cleared all the rounds. Your final report is ready, and a copy is on its way to your email.`
  if (round.passed) return `${thanks} Good news, you have cleared this round with ${round.score} out of 10, and you are selected for the next round.`
  return `${thanks} Unfortunately you did not clear this round this time. Your feedback report explains what went well and what to work on first.`
}

/** Seconds a candidate gets for each question type in Mock and Perform when the answer timer is on. */
export const TIME_LIMIT = { concept: 180, roleplay: 150, case: 240, scenario: 180 }
export const TIME_UP = "We're just about out of time on this one. Could you wrap up your answer?"
