import React from 'react';
import styled from 'styled-components';
import { createGlobalStyle }  from 'styled-components';
import colormap from 'colormap'
import { Popover, Link, Collapse } from '@allenai/varnish';

import { Tooltip, ColorizedToken } from './Shared';
import OutputField from './OutputField'
import {
  GRAD_INTERPRETER,
  IG_INTERPRETER,
  SG_INTERPRETER
  } from './InterpretConstants';

const TOOLTIP_ID = "saliency-tooltip";

export const getDescription = (interpreter) => {
  let description = ''
  if (interpreter === GRAD_INTERPRETER){
      description = <p> See saliency map interpretations generated by <a href="https://arxiv.org/abs/1312.6034" target="_blank" rel="noopener noreferrer">visualizing the gradient</a>. </p>
  } else if (interpreter === IG_INTERPRETER){
      description = <p> See saliency map interpretations generated using <a href="https://arxiv.org/abs/1703.01365" target="_blank" rel="noopener noreferrer">Integrated Gradients</a>.</p>
  } else if (interpreter === SG_INTERPRETER){
      description = <p> See saliency map interpretations generated using <a href="https://arxiv.org/abs/1706.03825" target="_blank" rel="noopener noreferrer">SmoothGrad</a>.</p>
  }
  return description;
}


const getTokenWeightPairs = (grads, tokens) => {
  return tokens.map((token, idx) => {
    let weight = grads[idx]
    // We do 1 - weight because the colormap is inverted
    return { token, weight: 1 - weight }
  })
}

const PopoverWidthFix = createGlobalStyle`
  .ant-popover{
    max-width: 70%;
  }
`;

export const SaliencyMaps = ({interpretData, inputTokens, inputHeaders, interpretModel, requestData}) => {
  const simpleGradData = interpretData.simple;
  const integratedGradData = interpretData.ig;
  const smoothGradData = interpretData.sg;
  const popContent = (
  <div>
    <p>
      Despite constant advances and seemingly super-human performance on constrained domains,
      state-of-the-art models for NLP are imperfect. These imperfections, coupled with today's
      advances being driven by (seemingly black-box) neural models, leave researchers and
      practitioners scratching their heads asking, <i>why did my model make this prediction?</i>
    </p>
    <a href="https://allennlp.org/interpret" target="_blank" rel="noopener noreferrer">Learn More</a>
  </div>);
  const interpretationHeader = (<>Model Interpretations
    <PopoverWidthFix />
    <Popover content={popContent} title="Model Interpretations">
      <WhatIsThis>What is this?</WhatIsThis>
    </Popover></>)
  return (
    <>
      <OutputField label={interpretationHeader}>
        <Collapse>
          <Collapse.Panel header="Simple Gradients Visualization">
            <SaliencyComponent interpretData={simpleGradData} inputTokens={inputTokens} inputHeaders={inputHeaders} interpretModel={interpretModel(requestData, GRAD_INTERPRETER)} interpreter={GRAD_INTERPRETER} />
          </Collapse.Panel>
          <Collapse.Panel header="Integrated Gradients Visualization">
            <SaliencyComponent interpretData={integratedGradData} inputTokens={inputTokens} inputHeaders={inputHeaders} interpretModel={interpretModel(requestData, IG_INTERPRETER)} interpreter={IG_INTERPRETER} />
          </Collapse.Panel>
          <Collapse.Panel header="SmoothGrad Visualization">
            <SaliencyComponent interpretData={smoothGradData} inputTokens={inputTokens} inputHeaders={inputHeaders} interpretModel={interpretModel(requestData, SG_INTERPRETER)} interpreter={SG_INTERPRETER}/>
          </Collapse.Panel>
        </Collapse>
      </OutputField>
  </>
  )
}

export class SaliencyComponent extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      topK: {all: 3}, // 3 words are highlighted by default
      loading: false,
    }

    this.callInterpretModel = this.callInterpretModel.bind(this)
    this.colorize = this.colorize.bind(this)
    this.handleInputTopKChange = this.handleInputTopKChange.bind(this)
    this.getTopKIndices = this.getTopKIndices.bind(this)
  }

  static defaultProps = {
    colormapProps: {
      colormap: 'copper',
      format: 'hex',
      nshades: 20
    }
  }

  callInterpretModel = interpretModel => () => {
    this.setState({ ...this.state, loading: true});
    interpretModel().then(() => this.setState({ loading: false }));
  }

  colorize(tokensWithWeights, topKIdx) {
    const {colormapProps} = this.props
    // colormap package takes minimum of 6 shades
    colormapProps.nshades =  Math.min(Math.max(colormapProps.nshades, 6), 72);
    const colors = colormap(colormapProps)

    let colorizedString = [];
    tokensWithWeights.forEach((obj, idx) => {
      colorizedString.push(
        // Again, 1 -, in this case because low extreme is blue and high extreme is red
        <label key={idx} data-tip={(1 - obj.weight).toFixed(3)} style={{ display: "inline-block" }} data-for={TOOLTIP_ID}>
            <ColorizedToken backgroundColor={topKIdx.has(idx) ? colors[Math.round(obj.weight * (colormapProps.nshades - 1))] : 'transparent'} key={idx}>
                {obj.token}
            </ColorizedToken>
        </label>
      )
    })
    return colorizedString
  }

  // when the user changes the slider for input 1, update how many tokens are highlighted
  handleInputTopKChange = inputIndex => e => {
    let stateUpdate = Object.assign({}, this.state)
    if (e.target.value.trim() === "") {
      stateUpdate['topK'][inputIndex] = e.target.value
    } else {
      stateUpdate['topK'][inputIndex] = parseInt(e.target.value, 10)
    }
    this.setState(stateUpdate)
  }

  // Extract top K tokens by saliency value and return only the indices of the top tokens
  getTopKIndices(tokensWithWeights, inputIndex) {
    function gradCompare(obj1, obj2) {
      return obj1.weight - obj2.weight
    }

    // Add indices so we can keep track after sorting
    let indexedTokens = tokensWithWeights.map((obj, idx) => { return {...obj, ...{idx}} })
    indexedTokens.sort(gradCompare)

    const k = inputIndex in this.state.topK ? this.state.topK[inputIndex] : this.state.topK.all
    const topKTokens = indexedTokens.slice(0, k)
    return topKTokens.map(obj => obj.idx)
  }

  render() {
    const { interpretData, inputTokens, inputHeaders, interpretModel, interpreter } = this.props
    const description = getDescription(interpreter)

    const runButton = <button
                        type="button"
                        className="btn"
                        style={{margin: "30px 0px"}}
                        onClick={this.callInterpretModel(interpretModel)}
                       >
                         Interpret Prediction
                      </button>

    let displayText = '';
    if (interpretData === undefined) {
      if (this.state.loading) {
        displayText = <div><p style={{color: "#7c7c7c"}}>Loading interpretation...</p></div>
      } else {
        displayText = <div><p style={{color: "#7c7c7c"}}>Press "interpret prediction" to show the interpretation.</p>{runButton}</div>
      }
    } else {
      const saliencyMaps = [];
      for (let i = 0; i < inputTokens.length; i++) {
        const grads = interpretData[i];
        const tokens = inputTokens[i];
        const header = inputHeaders[i];
        const tokenWeights = getTokenWeightPairs(grads, tokens);
        // indices with the top gradient values
        const topKIdx = new Set(this.getTopKIndices(tokenWeights, i))
        // the tokens highlighted based on their top values
        const colorMap = this.colorize(tokenWeights, topKIdx)
        const k = i in this.state.topK ? this.state.topK[i] : this.state.topK.all
        const saliencyMap = (
          <div key={i}>
            {header}
            {colorMap}
            <Tooltip multiline id={TOOLTIP_ID} /> <input type="range" min={0} max={colorMap.length} step="1" value={k} className="slider" onChange={this.handleInputTopKChange(i)} style={{ padding: "0px", margin: "10px 0px" }} />
            <br/>
            <span style={{ color: "#72BCFF" }}>Visualizing the top {k} most important words.</span>
            <br />
            <br />
          </div>
        )
        saliencyMaps.push(saliencyMap);
      }
      displayText = <div>{saliencyMaps}</div>
    }

    return (
      <>
        <div className="content">
            {description}
        </div>
        {displayText}
      </>
    )
  }
}

export const WhatIsThis = styled.span`
    ${Link.linkColorStyles()}
    padding-left: ${({theme}) => theme.spacing.md};
    font-style: italic;
`

export default SaliencyMaps