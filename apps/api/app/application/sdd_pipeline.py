from app.domain.sdd_models import ProjectProposal, TaskBreakdown, TechnicalSpec
from app.infrastructure.ai.llm_gateway import LiteLLMGateway


class SDDPipelineUseCase:
    """Use case for running the SDD pipeline (Proposal -> Spec -> Tasks)."""

    def __init__(self, llm_gateway: LiteLLMGateway, model: str = "gpt-4o"):
        self.llm_gateway = llm_gateway
        self.model = model

    def execute(self, requirements: str) -> dict:
        """
        Executes the SDD pipeline based on plain text requirements.
        Generates ProjectProposal -> TechnicalSpec -> TaskBreakdown sequentially.
        """
        # 1. Generate Project Proposal
        proposal_prompt = (
            f"Based on the following requirements, create a project proposal.\n"
            f"Requirements: {requirements}"
        )
        proposal_json = self.llm_gateway.generate_completion(
            prompt=proposal_prompt,
            model=self.model,
            response_format=ProjectProposal
        )
        proposal = ProjectProposal.model_validate_json(proposal_json)

        # 2. Generate Technical Spec
        spec_prompt = (
            f"Based on the following project proposal, create a technical specification.\n"
            f"Proposal Name: {proposal.change_name}\n"
            f"Description: {proposal.description}\n"
            f"Objectives: {', '.join(proposal.objectives)}"
        )
        spec_json = self.llm_gateway.generate_completion(
            prompt=spec_prompt,
            model=self.model,
            response_format=TechnicalSpec
        )
        spec = TechnicalSpec.model_validate_json(spec_json)

        # 3. Generate Task Breakdown
        task_prompt = (
            f"Based on the following technical specification, create a task breakdown.\n"
            f"Architecture: {spec.architecture}\n"
            f"Dependencies: {', '.join(spec.dependencies)}\n"
            f"Endpoints: {', '.join(spec.endpoints)}"
        )
        task_json = self.llm_gateway.generate_completion(
            prompt=task_prompt,
            model=self.model,
            response_format=TaskBreakdown
        )
        tasks = TaskBreakdown.model_validate_json(task_json)

        return {
            "proposal": proposal,
            "spec": spec,
            "tasks": tasks
        }
