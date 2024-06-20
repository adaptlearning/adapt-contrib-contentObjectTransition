import Adapt from 'core/js/adapt';
import wait from 'core/js/wait';

class ContentObjectTransition extends Backbone.Controller {

  initialize() {
    /**
     * href - @type {String} Original href
     * views - @type {[ContentObjectView]} Keep a list of all content object views
     * lastState - @type {Object} Keep that last scroll state for post animation restoration
     */
    this.href = window.location.href.replace(/#.*/, '');
    this.views = [];
    this.lastState = {
      scroll: 0
    };
    _.bindAll(this, 'endAnimation', 'updateHash');
    this.listenTo(Adapt, 'app:dataReady', this.onDataReady);
  }

  removeEventListeners() {

    this.stopListening(Adapt, {
      preRemove: this.onPreRemove,
      'contentObjectView:preRender': this.onContentObjectViewPreRender,
      'contentObjectView:preReady': this.onContentObjectViewPreReady,
      'contentObjectView:postRemove': this.onContentObjectViewPostRemove
    });
  }

  onDataReady() {
    const config = Adapt.course.get('_contentObjectTransition');
    this.removeEventListeners()
    if (!config || !config._isEnabled) return;
    this.setupOverrides();
    this.setupEventListeners();
  }

  setupOverrides() {
    // Stop adapt from destroying content object views and scrolling on render
    Adapt.set({
      _shouldDestroyContentObjects: false,
      _shouldContentObjectScrollTop: false
    });

    // Switch to history pushState and replaceState to enable popstate event
    Backbone.history._updateHash = this.updateHash;

    // Prevent scroll restoration when returning to a previous page
    history.scrollRestoration = 'manual';
  }

  updateHash(location, fragment, replace) {
    // Assume scroll position is always 0 on a new page
    this.lastState = { scroll: 0 };
    history[replace ? 'replaceState' : 'pushState'](this.lastState, '', `${this.href}#${fragment}`);
  }

  setupEventListeners() {

    // Animation event listeners
    this.listenTo(Adapt, {
      preRemove: this.onPreRemove,
      'contentObjectView:preRender': this.onContentObjectViewPreRender,
      'contentObjectView:preReady': this.onContentObjectViewPreReady,
      'contentObjectView:postRemove': this.onContentObjectViewPostRemove
    });
  }

  onPreRemove(contentObjectView) {
    if (!contentObjectView) return;

    this.views.push(contentObjectView);
  }

  onContentObjectViewPreRender(contentObjectView) {
    if (this.views.length < 1) return;

    if (this.lastState && this.lastState.scroll !== undefined) {
      // Offset incoming page to match required scroll top
      const scrollTo = this.lastState.scroll - $('.nav').height();
      contentObjectView.$el.css('top', -scrollTo);
    }

    const index = this.views.length;

    // Stop normal contentObject animation behaviour
    contentObjectView.disableAnimation = true;
    contentObjectView.$el.css('opacity', '');

    // Capture view
    this.views.push(contentObjectView);

    // Initialize animation
    contentObjectView.$el.addClass('contentobjecttransition__initial');

    // Is this a scroll forward or scroll back?
    const models = [Adapt.course].concat(Adapt.course.getAllDescendantModels(true));
    const previousModel = this.views[index - 1].model;
    const currentModel = contentObjectView.model;
    const previousIndex = models.findIndex(model => model === previousModel);
    const currentIndex = models.findIndex(model => model === currentModel);

    const isScrollForward = (currentIndex >= previousIndex);
    // Add appropriate animation
    if (isScrollForward) {
      contentObjectView.$el.addClass('contentobjecttransition__initial__forward');
      return;
    }
    contentObjectView.$el.addClass('contentobjecttransition__initial__backward');

  }

  onContentObjectViewPreReady(contentObjectView) {
    if (this.views.length < 2) return;
    const index = this.views.findIndex(view => view === contentObjectView);
    if (index === -1) return;

    // Holding loading screen
    wait.begin();

    // Add incoming animation event listeners and animation classes
    const incomingContentObject = this.views[index];
    incomingContentObject.$el[0].addEventListener('transitionend', this.endAnimation);
    incomingContentObject.$el[0].addEventListener('animationend', this.endAnimation);
    incomingContentObject.$el.addClass('contentobjecttransition__start');

    // Add outgoing animation classes
    const outgoingContentObject = this.views[index - 1];
    outgoingContentObject.$el.css('transform-origin', `center calc(${$(window).scrollTop()}px + (100vh / 2))`);
    outgoingContentObject.$el.addClass('contentobjecttransition__preremove');
    outgoingContentObject.$el.addClass('contentobjecttransition__remove');
  }

  endAnimation(event) {
    const index = this.views.findIndex(view => view.$el[0] === event.srcElement);
    if (index === -1) return;

    const incomingContentObject = this.views[index];
    if (!incomingContentObject.$el.hasClass('contentobjecttransition__start')) return;

    // Clean up incoming event listeners and animation classes
    incomingContentObject.$el[0].removeEventListener('transitionend', this.endAnimation);
    incomingContentObject.$el[0].removeEventListener('animationend', this.endAnimation);

    window.requestAnimationFrame(() => {
      // Remove incoming animation classes
      incomingContentObject.$el.removeClass([
        'contentobjecttransition__start',
        'contentobjecttransition__initial',
        'contentobjecttransition__initial__backward',
        'contentobjecttransition__initial__forward'
      ].join(' '));

      // Reset incoming scroll
      const scrollTo = (this.lastState && this.lastState.scroll !== undefined) ?
        this.lastState.scroll :
        0;
      $(window).scrollTop(scrollTo);
      incomingContentObject.$el.css('top', '');

      // Release loading screen
      wait.end();
    });

    // Destroy outgoing content object
    const outgoingContentObject = this.views[index - 1];
    outgoingContentObject.$el.remove();
    _.defer(() => {
      $(window).resize();
      outgoingContentObject.destroy();
    });
  }

  onContentObjectViewPostRemove(contentObjectView) {
    // Remove contentObject views from list
    const index = this.views.findIndex(view => view === contentObjectView);
    this.views.splice(index, 2);
  }

}

export default new ContentObjectTransition();
