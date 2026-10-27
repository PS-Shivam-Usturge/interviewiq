<!--
reportAgent · USER PROMPT TEMPLATE
Variables: {{role_title}} {{seniority}} {{required_skills}} {{candidate_name}} {{current_title}} {{years}}
           {{answer_count}} {{answers_json}}
           {{observations}} (optional block, see observations.md)
           {{assessment}}   (optional block, see assessment.md)
-->
Generate a complete eligibility report for this candidate.

ROLE APPLIED FOR: {{role_title}} ({{seniority}})
REQUIRED SKILLS: {{required_skills}}

CANDIDATE: {{candidate_name}}
CURRENT TITLE: {{current_title}}
EXPERIENCE: {{years}} years

INTERVIEW ANSWERS ({{answer_count}} questions):
{{answers_json}}

{{observations}}

{{assessment}}
