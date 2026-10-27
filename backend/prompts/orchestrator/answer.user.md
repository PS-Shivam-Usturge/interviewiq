<!--
Orchestrator · INTERVIEW PHASE · USER PROMPT TEMPLATE (one per answer)
Variables: {{role_title}} {{question_number}} {{total_questions}} {{category}}
           {{history}}          (optional block: memory.md or previous-answers.md)
           {{followup_label}}   (", follow-up" or empty)
           {{question}} {{answer}}
           {{followup_warning}} (optional block: followup-warning.md)
-->
INTERVIEW PHASE — a new answer has arrived. Follow the INTERVIEW PHASE tool policy.

Interview context:
- Role: {{role_title}}
- Progress: Question {{question_number}} of {{total_questions}} ({{category}} category)

{{history}}

Current question (Q{{question_number}}{{followup_label}}): "{{question}}"
<candidate_answer>
{{answer}}
</candidate_answer>
{{followup_warning}}
