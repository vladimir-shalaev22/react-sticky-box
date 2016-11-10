import React from "react";
import getPrefix from "./get-prefix";
import Measure from "react-measure";

function getScrollParent(node) {
  let offsetParent = node;
  while ((offsetParent = offsetParent.offsetParent)) {
    const overflowYVal = getComputedStyle(offsetParent, null).getPropertyValue("overflow-y");
    if (overflowYVal === "auto" || overflowYVal === "scroll") return offsetParent;
  }
  return window;
}

function getTotalOffsetTop(node) {
  if (node === window) return 0;
  const docElem = document.documentElement;
  return node.getBoundingClientRect().top + (window.pageYOffset || docElem.scrollTop) - (docElem.clientTop || 0);
}

const allBoxes = {};
let nextBoxId = 1;
export function updateAll() {
  Object.keys(allBoxes).forEach(b => allBoxes[b].handleScroll());
}

export default class OSBox extends React.Component {

  static propTypes = {
    width: React.PropTypes.number.isRequired
  }

  state = {
    height: 1
  }

  componentDidMount() {
    this.transformMethod = getPrefix("transform", this.node);
    if (!this.transformMethod) return;

    this.latestScrollY = 999999;
    this.mode = "notSet";

    this.computedParentStyle = getComputedStyle(this.node.parentNode.parentNode, null);
    this.scrollPane = getScrollParent(this.node);

    this.scrollPane.addEventListener("scroll", this.handleScroll);
    this.scrollPane.addEventListener("mousewheel", this.handleScroll);
    window.addEventListener("resize", this.handleScroll);

    this.handleScroll();
    this.myId = nextBoxId++;
    allBoxes[this.myId] = this;

    const compStyle = getComputedStyle(this.node);
    const reducePadding = compStyle.getPropertyValue("box-sizing") === "content-box" ? (
      parseInt(compStyle.getPropertyValue("padding-left"), 10) + parseInt(compStyle.getPropertyValue("padding-right"), 10)
    ) : 0;
    this.node.style.width = `${this.props.width - reducePadding}px`;
    this.setupMutationObserver();
  }

  componentWillUnmount() {
    if (!this.transformMethod) return;
    this.scrollPane.removeEventListener("scroll", this.handleScroll);
    this.scrollPane.removeEventListener("mousewheel", this.handleScroll);
    window.removeEventListener("resize", this.handleScroll);
    delete allBoxes[this.myId];
    if (this.observer) this.observer.disconnect();
  }

  setupMutationObserver() {
    if (window.MutationObserver) {
      this.observer = new MutationObserver(() => this.handleScroll());
      this.observer.observe(
        this.node.parentNode.parentNode,
        {subtree: true, attributes: true, childList: true, attributeFilter: ["style", "class"]}
      );
    }
  }

  handleScroll = () => {
    if (this.calculatedScrollPosThisTick) return;
    this.calculatedScrollPosThisTick = true;
    setTimeout(() => {this.calculatedScrollPosThisTick = false; });

    const containerHeight = this.node.parentNode.parentNode.offsetHeight;
    const parentPaddingTop = parseInt(this.computedParentStyle.getPropertyValue("padding-top"), 10);
    const parentPaddingBottom = parseInt(this.computedParentStyle.getPropertyValue("padding-bottom"), 10);

    const verticalMargin = parentPaddingTop + parentPaddingBottom;

    const scrollY = window.scrollY;
    const scrollDelta = scrollY - this.latestScrollY;

    const nodeHeight = this.node.getBoundingClientRect().height + verticalMargin;
    const parentTop = getTotalOffsetTop(this.node.parentNode.parentNode);
    const viewPortHeight = this.scrollPane === window ? window.innerHeight : this.scrollPane.offsetHeight;
    const scrollPaneOffsetTop = getTotalOffsetTop(this.scrollPane) + window.scrollY;

    this.latestScrollY = scrollY;
    let targetMode = this.mode;
    let nextOffset = this.offset;
    if (scrollPaneOffsetTop < parentTop + parentPaddingTop) { // if can't go further up, don't go further up!
      targetMode = "absolute";
      nextOffset = 0;
    } else if (parentTop + containerHeight - Math.min(viewPortHeight + parentPaddingBottom, nodeHeight - parentPaddingTop) <= scrollPaneOffsetTop) { // if can't go further down, don't go further down!
      nextOffset = containerHeight - nodeHeight;
      targetMode = "absolute";
    } else {
      if (this.mode === "notSet") {
        targetMode = "absolute";
        nextOffset = scrollPaneOffsetTop - parentTop;
      } else {
        if (viewPortHeight >= nodeHeight) { // if node smaller than window
          targetMode = "fixedTop";
        } else if (scrollDelta < 0) { // scroll up and node taller than window
          if (this.mode === "fixedBottom") {
            targetMode = "absolute";
            nextOffset = scrollPaneOffsetTop - parentTop - nodeHeight + viewPortHeight + parentPaddingBottom;
          } else if (this.mode === "absolute") {
            if (scrollPaneOffsetTop <= parentTop + this.offset + parentPaddingTop) {
              targetMode = "fixedTop";
            }
          }
        } else if (scrollDelta > 0) { // scroll down and node taller than window
          if (this.mode === "fixedTop") {
            targetMode = "absolute";
            nextOffset = scrollPaneOffsetTop - parentTop - parentPaddingTop;
          } else if (this.mode === "absolute") {
            if (scrollPaneOffsetTop + viewPortHeight >= nodeHeight + parentTop + this.offset - parentPaddingBottom) {
              targetMode = "fixedBottom";
            }
          }
        }
      }
    }

    if (targetMode !== this.mode || targetMode === "absolute" && this.offset !== nextOffset) {
      if (targetMode === "fixedTop") {
        this.node.style.top = 0;
        this.node.style.position = "fixed";
        this.node.style[this.transformMethod] = `translate3d(0, 0px, 0)`;
      } else if (targetMode === "fixedBottom") {
        this.node.style.top = 0;
        this.node.style.position = "fixed";
        this.node.style[this.transformMethod] = `translate3d(0, ${viewPortHeight - nodeHeight + verticalMargin}px, 0)`;
      } else if (targetMode === "absolute") {
        this.node.style.top = `${parentPaddingTop}px`;
        this.node.style.position = "absolute";
        this.node.style[this.transformMethod] = `translate3d(0, ${nextOffset + parentTop}px, 0)`;
        this.offset = nextOffset;
      }
      this.mode = targetMode;
    }
  }

  render() {
    const {width, children, ...rest} = this.props;
    const {height} = this.state;
    return (
      <div style={{width, height}}>
        <Measure whiteList={["height"]} onMeasure={({height: h}) => this.setState({height: h})}>
          <div ref={n => {this.node = n; }} {...rest}>{children}</div>
        </Measure>
      </div>
    );
  }
}
