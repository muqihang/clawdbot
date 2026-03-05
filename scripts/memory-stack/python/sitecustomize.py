import os


def _is_enabled(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


if _is_enabled(os.environ.get("OPENCLAW_DISABLE_POSTHOG_THREADS")):
    try:
        import posthog
    except Exception:
        posthog = None

    if posthog is not None:
        posthog_cls = getattr(posthog, "Posthog", None)
        if posthog_cls is not None and not getattr(posthog_cls, "_openclaw_patched", False):
            original_init = posthog_cls.__init__

            def patched_init(self, *args, **kwargs):
                kwargs.setdefault("send", False)
                kwargs.setdefault("disabled", True)
                kwargs.setdefault("sync_mode", True)
                return original_init(self, *args, **kwargs)

            posthog_cls.__init__ = patched_init
            posthog_cls._openclaw_patched = True
