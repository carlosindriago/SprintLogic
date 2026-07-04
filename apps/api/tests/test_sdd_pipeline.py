import json
from unittest.mock import MagicMock

from app.application.sdd_pipeline import SDDPipelineUseCase
from app.domain.sdd_models import ProjectProposal, TaskBreakdown, TechnicalSpec


def test_sdd_pipeline_execution():
    # Arrange
    mock_gateway = MagicMock()

    proposal_json = json.dumps({
        "change_name": "Auth Service",
        "description": "Implement user authentication.",
        "objectives": ["Secure login", "JWT tokens"]
    })

    spec_json = json.dumps({
        "architecture": "Microservice",
        "dependencies": ["FastAPI", "PyJWT"],
        "endpoints": ["/login", "/register"]
    })

    tasks_json = json.dumps({
        "tasks": ["Setup FastAPI", "Implement JWT", "Create endpoints"],
        "estimated_hours": 20.5
    })

    def mock_generate_completion(prompt, model, response_format):
        if response_format == ProjectProposal:
            return proposal_json
        elif response_format == TechnicalSpec:
            return spec_json
        elif response_format == TaskBreakdown:
            return tasks_json
        raise ValueError(f"Unexpected response_format: {response_format}")

    mock_gateway.generate_completion.side_effect = mock_generate_completion

    use_case = SDDPipelineUseCase(llm_gateway=mock_gateway, model="test-model")
    requirements = "I need an authentication service."

    # Act
    result = use_case.execute(requirements)

    # Assert
    assert "proposal" in result
    assert "spec" in result
    assert "tasks" in result

    assert isinstance(result["proposal"], ProjectProposal)
    assert result["proposal"].change_name == "Auth Service"
    assert result["proposal"].description == "Implement user authentication."
    assert result["proposal"].objectives == ["Secure login", "JWT tokens"]

    assert isinstance(result["spec"], TechnicalSpec)
    assert result["spec"].architecture == "Microservice"
    assert result["spec"].dependencies == ["FastAPI", "PyJWT"]
    assert result["spec"].endpoints == ["/login", "/register"]

    assert isinstance(result["tasks"], TaskBreakdown)
    assert result["tasks"].tasks == ["Setup FastAPI", "Implement JWT", "Create endpoints"]
    assert result["tasks"].estimated_hours == 20.5

    assert mock_gateway.generate_completion.call_count == 3
