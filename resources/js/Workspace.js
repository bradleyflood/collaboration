export default class Workspace {

    constructor(container) {
        this.container = container;
        this.echo = null;
        this.started = false;
        this.storeSubscriber = null;
        this.lastValues = {};

        this.debouncedBroadcastValueChange = _.debounce(function (payload) {
            this.broadcastValueChange(payload);
        }, 500);
    }

    start() {
        if (this.started) return;

        this.initializeEcho();
        this.started = true;
    }

    destroy() {
        this.storeSubscriber.apply();
        this.echo.leave(this.channelName);
    }

    initializeEcho() {
        const reference = this.container.reference.replace('::', '.');
        this.channelName = `${reference}.${this.container.site}`;
        this.channel = this.echo.join(this.channelName);

        this.channel.here(users => {
            this.subscribeToVuexMutations();
            const names = users.map(user => user.name).join(' ');
            Statamic.$notify.success(`Users here: ${names}`);
        });

        this.channel.joining(user => {
            Statamic.$notify.success(`${user.name} has joined.`);
        });

        this.channel.leaving(user => {
            Statamic.$notify.success(`${user.name} has left.`);
        });

        this.channel.listenForWhisper('updated', e => {
            this.applyBroadcastedValueChange(e);
        });
    }

    subscribeToVuexMutations() {
        this.storeSubscriber = Statamic.$store.subscribe((mutation, state) => {
            switch (mutation.type) {
                case `publish/${this.container.name}/setValue`:
                    this.vuexValueHasBeenSet(mutation.payload);
            }
        });
    }

    // A value has been set in the vuex store.
    // It could have been triggered by the current user editing something,
    // or by the workspace applying a change dispatched by another user editing something.
    vuexValueHasBeenSet(payload) {
        this.debug('Vuex value has been set', payload);
        if (!this.valueHasChanged(payload.handle, payload.value)) {
            // No change? Don't bother doing anything.
            this.debug(`Value for ${payload.handle} has not changed.`, { value: payload.value, lastValue: this.lastValues[payload.handle] });
            return;
        }

        this.rememberValueChange(payload.handle, payload.value);
        this.debouncedBroadcastValueChange(payload);
    }

    rememberValueChange(handle, value) {
        this.debug('Remembering value change', { handle, value });
        this.lastValues[handle] = clone(value);
    }

    valueHasChanged(handle, newValue) {
        const lastValue = this.lastValues[handle] || null;
        return JSON.stringify(lastValue) !== JSON.stringify(newValue);
    }

    broadcastValueChange(payload) {
        // Only my own change events should be broadcasted. Otherwise when other users receive
        // the broadcast, it will be re-broadcasted, and so on, to infinity and beyond.
        if (Statamic.$config.get('userId') == payload.user) {
            this.debug('📣 Broadcasting', payload);
            this.channel.whisper('updated', payload);
        }
    }

    applyBroadcastedValueChange(payload) {
        this.debug('✅ Applying broadcasted change', payload);
        Statamic.$store.dispatch(`publish/${this.container.name}/setValue`, payload);
    }

    debug(message, args) {
        console.log('[Collaboration]', message, {...args});
    }
}