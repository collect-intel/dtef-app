I want to add a module to this app that can somehow take structured survey data and generate Weval Blueprints that evaluate the model's ability to accurately predict a given population demographic segment's response to a question, based on provided responses to other questions in the survey (included as context in the evaluation), and also any demographic info included in the survey for that demographic segment.

This module should specify a clear data structure for generic survey data that can handle:
- poll questions (with multi-select and single-select options)
- open-ended questions
- text (in the survey that serves to give context between questions but is not a question itself)

and the data structure should delineate between demographic info (like age, gender, religion, country, etc) vs survey questions.
The data structure itself should not have opinionated definitions of what the demographic info types must be (i.e. not limited to just age, gender, religion, country, etc), and instead have generic question types across all demographic and surey questions.
But the point is it should clearly allow for the module user to OPTIONALLY define demographic info from the survey.
The module should make it easy to include/exclude any survey question or demographic info from the given data structure.


This module should take survey data and generate a given number of Blueprints from the given survey data, selecting participants either in order or at random from the survey data structure.

This module should be able to generate different TYPES of survey-generated population-level evaluation Blueprints, each with their own unique logic and evaluation prompts - but all using the same survey data structure.

The FIRST TYPE of survey-generated population-level evaluation Blueprint is one that simply:
1. takes the survey data and produces a percent likelihood of response to a given question for a given demographic segment, based on how many participants in that demographic segment responded to the question with the same answer
-- e.g. if 10 participants in the survey data are in the demographic segment of "Age: 18-25, Gender: Female, Country: United States, Environment: Urban, Religion: Christian", and 5 of them responded to the question "6. AI chatbots or digital companions" with the answer "a. Completely Acceptable", 3 said "b. Somewhat aceptable", 1 said "c. somewhat unacceptable", 0 said "d. completely unacceptable",   then this step would return, respectively: 50%, 30%, 10%, 0%
2. takes the results of the above step and generates a Blueprint for the given question, for the given demographic segment, that evaluates the model's ability to predict the likelihood of each answer to the question for the given demographic segment
(this currently ignores evaluating open-ended questions, but should be able to evaluate these in future iterations)


<BLUEPRINT_TEMPLATE>

Consider a demographic segment of the survey population with the following profile:
    - Age: {demographic[age_group]}
    - Gender: {demographic[gender]}
    - Country: {demographic[country]}
    - Environment: {demographic[environment]}
    - Religion: {demographic[religion]}

Participants in this demographic segment responded to the following survey questions with the response distributions indicated below.

<SURVEY>
{render(survey[:5])}
</SURVEY>

Based on the demographic profile and the pattern of responses shown above, what is the predicted probability distribution for how this demographic segment would respond to the following question?

{prompt(survey[6])}

Please provide the probability (as a percentage) for each answer option.

</BLUEPRINT_TEMPLATE>

This template would produce something like this actual Blueprint template (or, in the case of #2 - creating a module to run evaluations on a template, rather than creating a bunch of Blueprints like this, the Blueprint Template above WOULD BE the Blueprint, and the evaluations would all run AS IF they were running off many versions of blueprints like the one below):

<BLUEPRINT>

Consider a demographic segment of the survey population with the following profile:
    - Age: 18-25
    - Gender: Female
    - Country: United States
    - Environment: Urban
    - Religion: Judaism

Participants in this demographic segment responded to the following survey questions with the response distributions indicated below.

<SURVEY>
For each of the following, please indicate how acceptable you believe it is for people to develop an emotional connection or bond with them:

1. Pets or companion animals
    a. Completely Acceptable b. Mostly Acceptable c. Neutral / No Opinion d. Mostly Unacceptable e. Completely Unacceptable
    Response Distribution: a. 70% b. 20% c. 5% d. 5% e. 0%
2. Plants or natural elements
    a. Completely Acceptable b. Mostly Acceptable c. Neutral / No Opinion d. Mostly Unacceptable e. Completely Unacceptable
    Response Distribution: a. 40% b. 40% c. 10% d. 5% e. 5%
3. Wild animals
    a. Completely Acceptable b. Mostly Acceptable c. Neutral / No Opinion d. Mostly Unacceptable e. Completely Unacceptable
    Response Distribution: a. 10% b. 10% c. 20% d. 30% e. 30%
4. Cherished objects or everyday machines
    a. Completely Acceptable b. Mostly Acceptable c. Neutral / No Opinion d. Mostly Unacceptable e. Completely Unacceptable
    Response Distribution: a. 5% b. 5% c. 10% d. 40% e. 40%
5. Fictional characters
    a. Completely Acceptable b. Mostly Acceptable c. Neutral / No Opinion d. Mostly Unacceptable e. Completely Unacceptable
    Response Distribution: a. 15% b. 15% c. 40% d. 15% e. 15%
</SURVEY>

Based on the demographic profile and the pattern of responses shown above, what is the predicted probability distribution for how this demographic segment would respond to the following question?

6. AI chatbots or digital companions
    a. Completely Acceptable b. Mostly Acceptable c. Neutral / No Opinion d. Mostly Unacceptable e. Completely Unacceptable

Please provide the probability (as a percentage) for each answer option.


</BLUEPRINT>

